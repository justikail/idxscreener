/**
 * Aturan jadwal pembaruan harian (lapis 1: data penutupan). Fungsi murni —
 * tidak membaca jam sistem atau database sendiri — supaya worker lokal dan
 * cron server memakai keputusan yang sama dan bisa diuji.
 *
 * Bursa Efek Indonesia tutup sekitar 16.00 WIB. Data penutupan penyedia belum
 * tentu langsung tersedia, jadi percobaan pertama 17.00 WIB lalu diulang tiap
 * jam. Bila sampai percobaan terakhir belum ada sesi baru, hari itu dicatat
 * "no_session" (libur bursa atau penyedia terlambat) — tanpa kalender bursa
 * resmi kita tidak bisa membedakan keduanya, dan tidak berpura-pura bisa.
 */

export const DAILY_CAPABILITY = "daily_update";
/** Nama lock worker (`pnpm worker`) — juga dibaca panel admin sebagai tanda worker hidup. */
export const WORKER_LOCK = "worker";

export type DailyRunStatus =
  | "requested" // diminta manual dari panel admin, menunggu worker
  | "running"
  | "success" // sesi baru tersimpan dan indikator dihitung
  | "partial" // sebagian saham gagal — dicoba lagi pada jadwal berikutnya
  | "waiting" // belum ada sesi baru — dicoba lagi
  | "no_session" // percobaan terakhir, tetap tidak ada sesi baru
  | "failed";

/** Status yang berarti pekerjaan hari itu selesai dan tidak perlu diulang. */
export const FINAL_STATUSES: readonly string[] = ["success", "no_session"];

export interface DailyScheduleConfig {
  /** Jam WIB percobaan pertama (0–23). */
  startHourWib: number;
  /** Jeda minimum antar percobaan terjadwal. */
  retryEveryMinutes: number;
  /** Batas percobaan terjadwal per hari. */
  maxAttempts: number;
}

export const DEFAULT_DAILY_SCHEDULE: DailyScheduleConfig = {
  startHourWib: 17,
  retryEveryMinutes: 60,
  maxAttempts: 5,
};

export interface DailyRunRecord {
  status: string;
  startedAt: Date;
}

export type DailyDecision =
  | { action: "run"; attempt: number; finalAttempt: boolean }
  | { action: "wait"; reason: string };

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Tanggal (YYYY-MM-DD), hari (0=Minggu) dan menit-sejak-tengah-malam di WIB. */
export function wibClock(now: Date): { date: string; weekday: number; minutes: number } {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  return {
    date: wib.toISOString().slice(0, 10),
    weekday: wib.getUTCDay(),
    minutes: wib.getUTCHours() * 60 + wib.getUTCMinutes(),
  };
}

/**
 * Jam (menit WIB) sejak kapan candle hari itu dianggap final. Bursa tutup
 * sekitar 16.00 WIB; 16.30 memberi jeda untuk post-trading. ASUMSI — kapan
 * penyedia memfinalkan candle harian belum diverifikasi.
 */
export const SESSION_FINAL_MINUTES_WIB = 16 * 60 + 30;

/**
 * Tanggal WIB yang candle-nya BELUM final pada saat `now` (hari kerja sebelum
 * 16.30 WIB), atau null. Candle tanggal ini tidak disimpan sebagai penutupan.
 */
export function unfinishedSessionDate(now: Date): string | null {
  const clock = wibClock(now);
  const weekday = clock.weekday !== 0 && clock.weekday !== 6;
  return weekday && clock.minutes < SESSION_FINAL_MINUTES_WIB ? clock.date : null;
}

export function dailyBatchId(dateWib: string): string {
  return `daily-${dateWib}`;
}

/**
 * Putuskan apakah pembaruan terjadwal dijalankan sekarang.
 * @param todaysRuns run TERJADWAL berlabel tanggal WIB hari ini. Run manual
 *   dari panel admin memakai batch berbeda (`…-manual`) dan tidak dihitung:
 *   menjalankan manual pada siang hari tidak boleh membatalkan jadwal sore.
 */
export function decideDailyRun(
  now: Date,
  todaysRuns: readonly DailyRunRecord[],
  config: DailyScheduleConfig = DEFAULT_DAILY_SCHEDULE,
): DailyDecision {
  const clock = wibClock(now);
  if (clock.weekday === 0 || clock.weekday === 6) return { action: "wait", reason: "Akhir pekan — bursa tutup." };
  if (clock.minutes < config.startHourWib * 60) {
    return { action: "wait", reason: `Belum pukul ${String(config.startHourWib).padStart(2, "0")}.00 WIB.` };
  }

  if (todaysRuns.some((r) => FINAL_STATUSES.includes(r.status))) {
    return { action: "wait", reason: "Pembaruan hari ini sudah selesai." };
  }
  if (todaysRuns.some((r) => r.status === "running")) {
    return { action: "wait", reason: "Pembaruan sedang berjalan." };
  }

  const attempts = todaysRuns;
  if (attempts.length >= config.maxAttempts) {
    return { action: "wait", reason: `Batas ${config.maxAttempts} percobaan hari ini tercapai.` };
  }
  const last = attempts.reduce<Date | null>((acc, r) => (!acc || r.startedAt > acc ? r.startedAt : acc), null);
  if (last && now.getTime() - last.getTime() < config.retryEveryMinutes * 60_000) {
    return { action: "wait", reason: `Menunggu jeda ${config.retryEveryMinutes} menit sebelum mencoba lagi.` };
  }

  const attempt = attempts.length + 1;
  return { action: "run", attempt, finalAttempt: attempt >= config.maxAttempts };
}

/**
 * Berapa candle diminta per saham. Pembaruan rutin cukup 20 (batas minimum
 * Arjum) — sekaligus menangkap koreksi penyedia pada beberapa sesi terakhir.
 * Bila worker lama mati, jendela diperbesar mengikuti jarak hari kalender
 * (≈5/7 hari bursa) dengan cadangan, maksimal 500 (batas Arjum).
 */
export function historyLimitForGap(oldestLastDate: string | null, todayWib: string): number {
  if (!oldestLastDate) return 300;
  const days = Math.max(0, (Date.parse(`${todayWib}T00:00:00Z`) - Date.parse(`${oldestLastDate}T00:00:00Z`)) / 86_400_000);
  const sessions = Math.ceil((days * 5) / 7) + 5;
  return Math.min(500, Math.max(20, sessions));
}

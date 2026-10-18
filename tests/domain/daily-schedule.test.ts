import { describe, expect, it } from "vitest";

import { decideDailyRun, historyLimitForGap, unfinishedSessionDate, wibClock } from "@/server/jobs/daily-schedule";

// WIB = UTC+7. Senin 5 Okt 2026 17.00 WIB = 10.00Z.
const wib = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`);
const run = (status: string, at: Date) => ({ status, startedAt: at });

describe("wibClock", () => {
  it("tanggal WIB berganti pada tengah malam WIB, bukan UTC", () => {
    expect(wibClock(new Date("2026-10-05T16:59:00Z")).date).toBe("2026-10-05"); // 23.59 WIB
    expect(wibClock(new Date("2026-10-05T17:00:00Z")).date).toBe("2026-10-06"); // 00.00 WIB
  });
});

describe("decideDailyRun", () => {
  it("akhir pekan tidak dijalankan", () => {
    expect(decideDailyRun(wib("2026-10-04", "18:00"), [])).toMatchObject({ action: "wait" }); // Minggu
    expect(decideDailyRun(wib("2026-10-03", "18:00"), [])).toMatchObject({ action: "wait" }); // Sabtu
  });

  it("hari kerja sebelum 17.00 WIB menunggu; 17.00 tepat menjalankan percobaan pertama", () => {
    expect(decideDailyRun(wib("2026-10-05", "16:59"), [])).toMatchObject({ action: "wait" });
    expect(decideDailyRun(wib("2026-10-05", "17:00"), [])).toEqual({ action: "run", attempt: 1, finalAttempt: false });
  });

  it("setelah 'waiting', percobaan berikutnya baru setelah jeda 60 menit", () => {
    const first = run("waiting", wib("2026-10-05", "17:00"));
    expect(decideDailyRun(wib("2026-10-05", "17:59"), [first])).toMatchObject({ action: "wait" });
    expect(decideDailyRun(wib("2026-10-05", "18:00"), [first])).toEqual({ action: "run", attempt: 2, finalAttempt: false });
  });

  it("partial dan failed juga diulang; success dan no_session menghentikan hari itu", () => {
    const at = wib("2026-10-05", "17:00");
    const later = wib("2026-10-05", "19:00");
    expect(decideDailyRun(later, [run("partial", at)])).toMatchObject({ action: "run" });
    expect(decideDailyRun(later, [run("failed", at)])).toMatchObject({ action: "run" });
    expect(decideDailyRun(later, [run("success", at)])).toMatchObject({ action: "wait" });
    expect(decideDailyRun(later, [run("no_session", at)])).toMatchObject({ action: "wait" });
  });

  it("percobaan ke-5 ditandai terakhir, setelah itu berhenti", () => {
    const four = ["17:00", "18:00", "19:00", "20:00"].map((t) => run("waiting", wib("2026-10-05", t)));
    expect(decideDailyRun(wib("2026-10-05", "21:00"), four)).toEqual({ action: "run", attempt: 5, finalAttempt: true });
    const five = [...four, run("waiting", wib("2026-10-05", "21:00"))];
    expect(decideDailyRun(wib("2026-10-05", "23:00"), five)).toMatchObject({ action: "wait" });
  });

  it("run yang masih berjalan tidak ditumpuk", () => {
    expect(decideDailyRun(wib("2026-10-05", "19:00"), [run("running", wib("2026-10-05", "17:00"))])).toMatchObject({ action: "wait" });
  });
});

describe("historyLimitForGap", () => {
  it("pembaruan rutin memakai minimum 20 candle", () => {
    expect(historyLimitForGap("2026-10-02", "2026-10-05")).toBe(20);
  });

  it("worker lama mati: jendela membesar mengikuti jarak hari", () => {
    // 60 hari kalender ≈ 43 hari bursa + cadangan 5
    expect(historyLimitForGap("2026-08-06", "2026-10-05")).toBe(48);
  });

  it("dibatasi 500 (batas penyedia) dan 300 bila belum ada data", () => {
    expect(historyLimitForGap("2020-01-01", "2026-10-05")).toBe(500);
    expect(historyLimitForGap(null, "2026-10-05")).toBe(300);
  });
});

describe("unfinishedSessionDate", () => {
  it("hari kerja sebelum 16.30 WIB: candle hari ini belum final", () => {
    expect(unfinishedSessionDate(wib("2026-10-05", "10:00"))).toBe("2026-10-05");
    expect(unfinishedSessionDate(wib("2026-10-05", "16:29"))).toBe("2026-10-05");
  });

  it("setelah 16.30 WIB dan akhir pekan: tidak ada candle yang ditahan", () => {
    expect(unfinishedSessionDate(wib("2026-10-05", "16:30"))).toBeNull();
    expect(unfinishedSessionDate(wib("2026-10-04", "10:00"))).toBeNull();
  });
});

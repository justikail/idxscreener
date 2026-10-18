import { formatDateTimeWib, formatTradingDate } from "@/lib/format";

/**
 * Kerangka bagian yang konsisten di seluruh aplikasi:
 * judul → satu kalimat "intinya" (bahasa sehari-hari) → isi → "cara membaca"
 * yang bisa dibuka. Disclaimer panjang tidak lagi ditumpuk sebagai paragraf
 * abu-abu kecil di bawah setiap grafik.
 */
export function SectionHeader({
  id,
  title,
  eyebrow,
  takeaway,
  chips,
  action,
}: {
  id?: string;
  title: string;
  eyebrow?: string;
  takeaway?: React.ReactNode;
  chips?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b-2 border-ink-900 pb-3">
        <div className="min-w-0">
          {eyebrow && <p className="kicker mb-1">{eyebrow}</p>}
          <h2 id={id} className="section-title">
            {title}
          </h2>
        </div>
        {(chips || action) && (
          <div className="flex flex-wrap items-center gap-2">
            {chips}
            {action}
          </div>
        )}
      </div>
      {takeaway && <Takeaway>{takeaway}</Takeaway>}
    </header>
  );
}

/** Kalimat inti: dibaca lebih dulu daripada angka. Ukuran teks besar agar nyaman bagi semua umur. */
export function Takeaway({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex gap-3 text-[1.0625rem] leading-relaxed text-ink-800">
      <span aria-hidden className="mt-[0.55em] h-2 w-2 shrink-0 rotate-45 bg-kunyit-500" />
      <span>{children}</span>
    </p>
  );
}

/** Catatan metode & batasan — tersedia tetapi tidak menghalangi. */
export function HowToRead({ title = "Cara membaca & catatan data", children }: { title?: string; children: React.ReactNode }) {
  return (
    <details className="group mt-5 rounded-md border border-ink-200 bg-card/70 open:bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium text-ink-700 hover:text-ink-900 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-ink-400 font-mono text-xs text-ink-600 group-open:border-kunyit-600 group-open:bg-kunyit-100 group-open:text-kunyit-800">
          ?
        </span>
        <span className="flex-1">{title}</span>
        <span aria-hidden className="font-mono text-xs text-ink-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-2 border-t border-ink-200 px-4 py-4 text-sm leading-relaxed text-ink-700 [&_li]:ml-4 [&_li]:list-disc [&_li]:pl-1">{children}</div>
    </details>
  );
}

/** Tautan ke panel "Kelengkapan data" (minta data yang belum ada). */
export function RequestLink({ href = "#kelengkapan" }: { href?: string }) {
  return (
    <a href={href} className="mt-2 inline-flex items-center gap-1 rounded-full border border-ink-900 px-3 py-1 text-sm font-semibold text-ink-900 hover:bg-ink-900 hover:text-paper">
      Minta data ini ↑
    </a>
  );
}

/** Keadaan kosong yang menjelaskan KENAPA kosong dan KAPAN data biasanya muncul. */
export function EmptyState({ title, children, icon = "◌" }: { title: string; children?: React.ReactNode; icon?: string }) {
  return (
    <div className="flex gap-4 rounded-md border border-dashed border-ink-300 bg-card/60 p-5">
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink-100 font-mono text-lg text-ink-500">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-ink-800">{title}</p>
        {children && <div className="mt-1 text-sm leading-relaxed text-ink-600">{children}</div>}
      </div>
    </div>
  );
}

type ChipTone = "neutral" | "good" | "warn" | "bad" | "info";
const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "border-ink-300 bg-paper text-ink-700",
  good: "border-up-300 bg-up-50 text-up-800",
  warn: "border-kunyit-300 bg-kunyit-50 text-kunyit-900",
  bad: "border-down-300 bg-down-50 text-down-800",
  info: "border-ink-900 bg-ink-900 text-paper",
};

/** Label kecil dengan simbol + teks (status tidak pernah hanya lewat warna). */
export function Chip({ tone = "neutral", icon, children, title }: { tone?: ChipTone; icon?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${CHIP_TONE[tone]}`}>
      {icon && (
        <span aria-hidden className="font-mono text-[0.8em]">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

/** Selisih hari kalender antara dua tanggal YYYY-MM-DD (tanpa zona waktu). */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10));
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function relativeDays(days: number): string {
  if (days <= 0) return "hari ini";
  if (days === 1) return "kemarin";
  if (days < 14) return `${days} hari lalu`;
  if (days < 60) return `${Math.round(days / 7)} minggu lalu`;
  return `${Math.round(days / 30)} bulan lalu`;
}

/**
 * Tanggal data + umurnya. `staleAfterDays` menentukan kapan chip berubah
 * kuning; ambang berbeda per jenis data (harian vs laporan kuartalan).
 */
export function FreshnessChip({ date, today, label = "Data", staleAfterDays = 4 }: { date: string | null; today: string; label?: string; staleAfterDays?: number }) {
  if (!date) return <Chip icon="○">Belum ada data</Chip>;
  const age = daysBetween(date, today);
  return (
    <Chip tone={age > staleAfterDays ? "warn" : "neutral"} icon={age > staleAfterDays ? "◷" : "●"} title={`${label} ${formatTradingDate(date)}`}>
      {label} {formatTradingDate(date, { weekday: false })} · {relativeDays(age)}
    </Chip>
  );
}

export function FetchedChip({ at }: { at: Date | string | null }) {
  if (!at) return null;
  return (
    <Chip icon="↓" title="Waktu data diambil dari Pihak Ketiga">
      Diambil {formatDateTimeWib(at)}
    </Chip>
  );
}

export type Coverage = "complete" | "partial" | "unknown" | "empty";
const COVERAGE: Record<Coverage, { tone: ChipTone; icon: string; text: string }> = {
  complete: { tone: "good", icon: "✓", text: "Lengkap" },
  partial: { tone: "warn", icon: "◐", text: "Sebagian" },
  unknown: { tone: "neutral", icon: "?", text: "Kelengkapan belum diuji" },
  empty: { tone: "neutral", icon: "○", text: "Belum tersedia" },
};

export function CoverageChip({ coverage, detail }: { coverage: Coverage; detail?: string }) {
  const c = COVERAGE[coverage];
  return (
    <Chip tone={c.tone} icon={c.icon} title={detail}>
      {c.text}
      {detail ? <span className="font-normal opacity-80">· {detail}</span> : null}
    </Chip>
  );
}

/** Angka utama + keterangan. */
export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neutral" | "up" | "down" | "muted";
}) {
  const color = tone === "up" ? "text-up-700" : tone === "down" ? "text-down-600" : tone === "muted" ? "text-ink-400" : "text-ink-900";
  return (
    <div className="rounded-md border border-ink-200 bg-card p-4">
      <dt className="text-sm text-ink-600">{label}</dt>
      <dd className={`num mt-1.5 text-2xl font-semibold leading-tight ${color}`}>{value}</dd>
      {sub && <dd className="mt-1 text-[0.8125rem] leading-snug text-ink-600">{sub}</dd>}
    </div>
  );
}

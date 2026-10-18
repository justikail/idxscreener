import Link from "next/link";

import { formatNumber, formatPercent } from "@/lib/format";

interface TickerItem {
  code: string;
  close: number | null;
  changePct: number | null;
}

/**
 * Pita kurs berjalan. Isi digandakan untuk loop mulus; salinan kedua
 * aria-hidden. Berhenti saat hover/fokus dan dimatikan oleh
 * prefers-reduced-motion (lihat globals.css). Ini tampilan harga PENUTUPAN
 * terakhir, bukan realtime.
 */
export function TickerTape({ items, label }: { items: TickerItem[]; label: string }) {
  if (items.length === 0) return null;

  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={hidden || undefined}>
      {items.map((t) => {
        const dir = (t.changePct ?? 0) > 0 ? "up" : (t.changePct ?? 0) < 0 ? "down" : "flat";
        return (
          <li key={`${hidden ? "b" : "a"}-${t.code}`} className="flex items-baseline gap-2 whitespace-nowrap">
            <Link
              href={`/saham/${t.code}`}
              tabIndex={hidden ? -1 : undefined}
              className="num font-semibold tracking-wide text-paper hover:text-kunyit-300"
            >
              {t.code}
            </Link>
            <span className="num text-ink-300">{t.close !== null ? formatNumber(t.close) : "—"}</span>
            <span
              className={`num ${dir === "up" ? "text-up-300" : dir === "down" ? "text-down-300" : "text-ink-400"}`}
            >
              {dir === "up" ? "▲" : dir === "down" ? "▼" : "■"} {t.changePct !== null ? formatPercent(t.changePct) : "—"}
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section aria-label={label} className="group relative overflow-hidden border-y border-ink-950 bg-ink-900 py-2 text-sm">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-ink-900 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-ink-900 to-transparent" />
      <div className="flex w-max animate-ticker group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
}

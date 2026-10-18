import type { Insight } from "./insights";

const VALUE_TONE: Record<Insight["tone"], string> = {
  up: "text-up-700",
  down: "text-down-600",
  neutral: "text-ink-900",
  muted: "text-ink-400",
};

/** Ringkasan "Sekilas": tiap kartu satu fakta + satu kalimat, dan menuju bagian rinciannya. */
export function InsightGrid({ code, insights, asOf, columns = 4 }: { code: string; insights: Insight[]; asOf: string | null; columns?: 3 | 4 }) {
  return (
    <section aria-labelledby="sekilas" className="animate-rise">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h2 id="sekilas" className="font-display text-2xl font-semibold tracking-tight">
          {code} sekilas
        </h2>
        <p className="text-sm text-ink-500">Ringkasan dari data tersimpan{asOf ? `, per ${asOf}` : ""} · bukan saran jual/beli</p>
      </div>
      <p className="mb-2 text-sm text-ink-500 sm:hidden" aria-hidden>
        Geser ke samping untuk melihat semua →
      </p>
      <ul className={`-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 ${columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        {insights.map((it) => (
          <li key={it.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
            <a
              href={it.href}
              className={`group flex h-full flex-col rounded-md border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-ink-900 hover:shadow-[0_6px_0_-2px_rgba(23,20,15,0.9)] ${
                it.tone === "muted" ? "border-dashed border-ink-300" : "border-ink-200"
              }`}
            >
              <span className="text-sm text-ink-600">{it.label}</span>
              <span className={`num mt-1 text-xl font-semibold leading-tight ${VALUE_TONE[it.tone]}`}>{it.value}</span>
              <span className="mt-2 flex-1 text-[0.9375rem] leading-snug text-ink-800">{it.sentence}</span>
              <span className="mt-3 text-xs font-medium text-ink-500 group-hover:text-kunyit-700">Lihat rincian →</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

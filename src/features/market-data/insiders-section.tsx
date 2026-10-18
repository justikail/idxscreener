import { Term } from "@/components/Term";
import { Chip, EmptyState, HowToRead, RequestLink, SectionHeader } from "@/components/ui/section";
import { formatCompact, formatNumber, formatTradingDate } from "@/lib/format";

type Row = {
  id: number;
  holderName: string;
  txDate: string;
  actionType: string;
  badges: string[] | null;
  previousShares: string | null;
  previousPct: string | null;
  currentShares: string | null;
  currentPct: string | null;
  changeShares: string | null;
  price: string | null;
};

const ACTION: Record<string, { label: string; tone: "good" | "bad" | "neutral"; icon: string }> = {
  buy: { label: "Beli", tone: "good", icon: "▲" },
  sell: { label: "Jual", tone: "bad", icon: "▼" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const pctText = (v: string | null) => (v === null ? null : `${Number(v).toLocaleString("id-ID", { maximumFractionDigits: 4 })}%`);
const sharesText = (v: string | null) => (v === null ? "—" : formatCompact(Number(v), 2));
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s./-])\p{L}/gu, (m) => m.toUpperCase());

function groupByDate<T extends { txDate: string }>(rows: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const r of rows) map.set(r.txDate, [...(map.get(r.txDate) ?? []), r]);
  return [...map.entries()];
}

export type InsiderSummary = { total: number; latest: string | null; buys: number; sells: number; others: number };

export function insiderSummary(rows: Array<{ txDate: string; actionType: string }>): InsiderSummary {
  return {
    total: rows.length,
    latest: rows.reduce<string | null>((a, r) => (a === null || r.txDate > a ? r.txDate : a), null),
    buys: rows.filter((r) => r.actionType === "buy").length,
    sells: rows.filter((r) => r.actionType === "sell").length,
    others: rows.filter((r) => r.actionType !== "buy" && r.actionType !== "sell").length,
  };
}

export function InsidersSection({
  id,
  rows,
  summary,
  fetchedNote,
  top,
  bottom,
  requestable = false,
}: {
  id: string;
  rows: Row[];
  summary: InsiderSummary;
  fetchedNote: string | null;
  top?: React.ReactNode;
  bottom?: React.ReactNode;
  requestable?: boolean;
}) {
  if (summary.total === 0) {
    return (
      <>
        <SectionHeader id={id} eyebrow="Orang dalam perusahaan" title="Transaksi insider" />
        <EmptyState title="Belum ada laporan kepemilikan insider yang tersimpan." icon="◎">
          Bisa berarti belum diambil, atau sumber memang tidak memiliki laporan untuk saham ini.
          {requestable && (
            <span className="block">
              <RequestLink />
            </span>
          )}
        </EmptyState>
      </>
    );
  }
  return (
    <>
      <SectionHeader
        id={id}
        eyebrow="Orang dalam perusahaan"
        title="Transaksi insider"
        takeaway={
          <>
            <strong>{summary.total} laporan</strong> perubahan kepemilikan direksi, komisaris, atau pemegang saham besar tersimpan
            {summary.latest && <>, terakhir <strong>{formatTradingDate(summary.latest, { weekday: false })}</strong></>}. Menurut sumber:{" "}
            {[summary.buys ? `${summary.buys} beli` : null, summary.sells ? `${summary.sells} jual` : null, summary.others ? `${summary.others} lainnya` : null]
              .filter(Boolean)
              .join(", ")}
            .
          </>
        }
        chips={fetchedNote ? <Chip icon={fetchedNote.startsWith("Seluruh") ? "✓" : "◐"} tone={fetchedNote.startsWith("Seluruh") ? "good" : "warn"}>{fetchedNote.startsWith("Seluruh") ? "Riwayat lengkap" : "Riwayat masih diambil"}</Chip> : undefined}
      />
      {top}
      <ol className="flex flex-col gap-5">
        {groupByDate(rows).map(([date, group]) => {
          const [y, m, d] = date.split("-");
          return (
            <li key={date}>
              <h3 className="mb-2 flex items-baseline gap-3">
                <span className="num text-lg font-bold">
                  {Number(d)} {MONTHS[Number(m) - 1]} {y}
                </span>
                <span className="text-sm text-ink-500">{group.length} laporan</span>
              </h3>
              <ul className="overflow-hidden rounded-md border border-ink-200 bg-card">
                {group.map((r) => {
                  const a = ACTION[r.actionType] ?? { label: r.actionType, tone: "neutral" as const, icon: "•" };
                  const change = r.changeShares === null ? null : Number(r.changeShares);
                  return (
                    <li key={r.id} className="grid gap-x-4 gap-y-1 border-b border-ink-100 px-4 py-3 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink-900">{titleCase(r.holderName)}</span>
                          {r.badges?.map((b) => (
                            <span key={b} className="rounded-sm bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                              {b}
                            </span>
                          ))}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-700">
                          <span className="num">{sharesText(r.previousShares)}</span>
                          <span className="mx-1.5 text-ink-400" aria-label="menjadi">→</span>
                          <span className="num font-semibold">{sharesText(r.currentShares)}</span> lembar
                          {pctText(r.currentPct) && (
                            <span className="text-ink-500">
                              {" "}
                              ({pctText(r.previousPct) ?? "—"} → {pctText(r.currentPct)} kepemilikan)
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                        <Chip tone={a.tone} icon={a.icon}>
                          {a.label} <span className="sr-only">menurut sumber</span>
                        </Chip>
                        <span className={`num min-w-[6rem] text-right text-sm font-semibold ${change === null ? "text-ink-400" : change >= 0 ? "text-up-700" : "text-down-600"}`}>
                          {change === null ? "—" : `${change >= 0 ? "+" : "−"}${formatNumber(Math.abs(change))}`}
                        </span>
                        {r.price !== null && <span className="num text-xs text-ink-500">@ Rp{formatNumber(Number(r.price))}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      {bottom}
      <HowToRead>
        <ul>
          <li>
            <Term k="insider">Insider</Term> = direksi, komisaris, atau pemegang saham besar yang wajib melaporkan perubahan kepemilikannya.
          </li>
          <li>
            &ldquo;Beli/Jual&rdquo; ditampilkan sesuai label sumber. Perubahan kepemilikan tidak selalu berarti transaksi di pasar reguler (bisa
            program saham karyawan, hibah, atau aksi korporasi).
          </li>
          <li>Nilai yang tidak tersedia di sumber ditampilkan &ldquo;—&rdquo;, bukan nol. {fetchedNote}</li>
        </ul>
      </HowToRead>
    </>
  );
}

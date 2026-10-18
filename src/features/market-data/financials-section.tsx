import { BarSeries, type BarDatum } from "@/components/charts/BarSeries";
import { Term } from "@/components/Term";
import { Chip, EmptyState, HowToRead, RequestLink, SectionHeader, StatTile } from "@/components/ui/section";
import { formatCompact, formatCompactIdr, formatDateTimeWib, formatNumber, formatPercent } from "@/lib/format";

export type FactRow = {
  fiscal_year: number;
  fiscal_quarter: number;
  period_basis: string;
  concept: string;
  value: string | null;
  validation: string | null;
  provider_fetched_at: string | null;
  fetched_at: Date | string;
  source: string;
};

type ReportRow = {
  report_type: string;
  period: string;
  fiscal_year: number;
  fiscal_quarter: number;
  label: string | null;
  provider_fetched_at: string | null;
  data: Record<string, unknown>;
  version: number;
  fetched_at: Date | string;
};

const COLUMNS: Array<{ concept: string; label: string; perShare?: boolean }> = [
  { concept: "net_income", label: "Laba bersih (induk)" },
  { concept: "eps_basic", label: "EPS dasar", perShare: true },
  { concept: "revenue", label: "Pendapatan" },
  { concept: "total_assets", label: "Total aset" },
  { concept: "equity_parent", label: "Ekuitas induk" },
  { concept: "total_liabilities", label: "Total liabilitas" },
];

const BASIS_LABEL: Record<string, string> = {
  quarter: "kuartal mandiri",
  quarter_unverified: "kuartal, basis belum terverifikasi",
  ytd: "kumulatif sejak awal tahun (YTD)",
  annual: "tahunan",
  instant: "posisi akhir periode",
};

const REPORT_LABEL: Record<string, string> = {
  INCOME_STATEMENT: "Laba rugi",
  BALANCE_SHEET: "Neraca (posisi keuangan)",
  CASH_FLOW_REPORT: "Arus kas",
};

const FLOW_BASES = new Set(["quarter", "quarter_unverified"]);

function humanize(key: string): string {
  const s = key.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cell(value: number | null, perShare = false): string {
  if (value === null) return "—";
  return perShare ? formatNumber(value, 0) : formatCompact(value, 2);
}

const qLabel = (y: number, q: number) => `Q${q} ${y}`;
const qShort = (y: number, q: number) => `Q${q} '${String(y).slice(2)}`;

function usableFacts(facts: FactRow[]) {
  const live = facts.filter((f) => f.source !== "demo");
  return (live.length > 0 ? live : facts).filter((f) => FLOW_BASES.has(f.period_basis) || f.period_basis === "instant");
}

const valueOf = (f: FactRow | undefined) => (f?.value === null || f?.value === undefined ? null : Number(f.value));

/**
 * Laba kuartal terbaru + perubahan terhadap kuartal sama tahun lalu.
 * Perbandingan hanya bila KEDUA kuartal terbukti mandiri (bukan YTD/belum terverifikasi).
 */
export function profitSummary(facts: FactRow[]) {
  const usable = usableFacts(facts);
  const concept = usable.some((f) => f.concept === "net_income" && f.value !== null) ? "net_income" : "net_income_total";
  const rows = usable
    .filter((f) => f.concept === concept && FLOW_BASES.has(f.period_basis) && f.value !== null)
    .sort((a, b) => b.fiscal_year - a.fiscal_year || b.fiscal_quarter - a.fiscal_quarter);
  const latest = rows[0];
  if (!latest) return null;
  const prior = rows.find((r) => r.fiscal_year === latest.fiscal_year - 1 && r.fiscal_quarter === latest.fiscal_quarter);
  const verified = latest.period_basis === "quarter";
  const comparable = verified && prior?.period_basis === "quarter" && Number(prior.value) > 0;
  return {
    label: qLabel(latest.fiscal_year, latest.fiscal_quarter),
    value: Number(latest.value),
    yoyPct: comparable ? ((Number(latest.value) - Number(prior!.value)) / Math.abs(Number(prior!.value))) * 100 : null,
    verified,
  };
}

export function FinancialsSection({ id, facts, reports, requestable = false }: { id: string; facts: FactRow[]; reports: ReportRow[]; requestable?: boolean }) {
  const usable = usableFacts(facts);

  if (usable.length === 0 && reports.length === 0) {
    return (
      <>
        <SectionHeader id={id} eyebrow="Kinerja perusahaan" title="Laporan keuangan" />
        <EmptyState title="Laporan keuangan saham ini belum diambil." icon="▤">
          Laporan diambil bergiliran sesuai kuota harian. Kami tidak menampilkan angka perkiraan; rasio seperti PER dan ROE akan
          muncul setelah laporan 4 kuartal tersedia.
          {requestable && (
            <span className="block">
              <RequestLink />
            </span>
          )}
        </EmptyState>
      </>
    );
  }

  const get = (y: number, q: number, concept: string, flow: boolean) =>
    usable.find((f) => f.fiscal_year === y && f.fiscal_quarter === q && f.concept === concept && (flow ? FLOW_BASES.has(f.period_basis) : f.period_basis === "instant"));

  const profitConcept = usable.some((f) => f.concept === "net_income" && f.value !== null) ? "net_income" : "net_income_total";
  const flowPeriods = [...new Set(usable.filter((f) => FLOW_BASES.has(f.period_basis)).map((f) => f.fiscal_year * 10 + f.fiscal_quarter))]
    .sort((a, b) => a - b)
    .slice(-12)
    .map((k) => [Math.floor(k / 10), k % 10] as const);
  const allPeriods = [...new Set(usable.map((f) => f.fiscal_year * 10 + f.fiscal_quarter))].sort((a, b) => b - a).slice(0, 12).map((k) => [Math.floor(k / 10), k % 10] as const);

  const bars: BarDatum[] = flowPeriods.map(([y, q]) => {
    const f = get(y, q, profitConcept, true);
    const rev = valueOf(get(y, q, "revenue", true));
    return {
      key: `${y}${q}`,
      label: qShort(y, q),
      value: valueOf(f),
      muted: f?.period_basis === "quarter_unverified",
      detail: [
        qLabel(y, q),
        rev !== null ? `Pendapatan ${formatCompactIdr(rev)}` : "",
        f?.period_basis === "quarter_unverified" ? "Basis belum terverifikasi" : f?.validation?.startsWith("derived") ? "Diturunkan dari laporan tahunan" : "",
      ].filter(Boolean),
    };
  });

  const profit = profitSummary(facts);
  const instantPeriods = allPeriods.filter(([y, q]) => get(y, q, "total_assets", false));
  const [by, bq] = instantPeriods[0] ?? [null, null];
  const assets = by !== null ? valueOf(get(by, bq!, "total_assets", false)) : null;
  const liabilities = by !== null ? valueOf(get(by, bq!, "total_liabilities", false)) : null;
  const equity = by !== null ? valueOf(get(by, bq!, "equity_parent", false)) ?? valueOf(get(by, bq!, "total_equity", false)) : null;
  const totalEquity = by !== null ? valueOf(get(by, bq!, "total_equity", false)) ?? equity : null;
  const latestRevenue = profit ? valueOf(usable.find((f) => f.concept === "revenue" && qLabel(f.fiscal_year, f.fiscal_quarter) === profit.label && FLOW_BASES.has(f.period_basis))) : null;

  const unverified = usable.some((f) => f.period_basis === "quarter_unverified");
  const zeroMissing = usable.some((f) => f.validation === "zero_as_missing" || f.validation === "eps_inconsistent");
  const fetched = usable.map((f) => f.provider_fetched_at).filter(Boolean).sort().at(-1);
  const savedAt = usable.map((f) => new Date(f.fetched_at)).sort((a, b) => b.getTime() - a.getTime())[0];

  const latestByType = new Map<string, ReportRow>();
  for (const r of reports.filter((r) => r.period === "quarterly")) {
    const cur = latestByType.get(r.report_type);
    if (!cur || r.fiscal_year > cur.fiscal_year || (r.fiscal_year === cur.fiscal_year && r.fiscal_quarter > cur.fiscal_quarter)) latestByType.set(r.report_type, r);
  }

  const takeaway = profit ? (
    <>
      {profit.value >= 0 ? "Laba bersih" : "Rugi bersih"} <strong>{profit.label}</strong> sebesar <strong className="num">{formatCompactIdr(Math.abs(profit.value))}</strong>
      {profit.yoyPct !== null
        ? `, ${profit.yoyPct >= 0 ? "naik" : "turun"} ${formatPercent(Math.abs(profit.yoyPct), 1).replace("+", "")} dibanding kuartal yang sama tahun lalu.`
        : profit.verified
          ? "."
          : ". Angka kuartalnya belum terbukti berdiri sendiri, jadi belum kami bandingkan dan belum dipakai menghitung PER/ROE."}
    </>
  ) : (
    "Laporan tersimpan, tetapi laba bersih belum dapat dipetakan untuk format laporan emiten ini."
  );

  return (
    <>
      <SectionHeader
        id={id}
        eyebrow="Kinerja perusahaan"
        title="Laporan keuangan"
        takeaway={takeaway}
        chips={
          <>
            {unverified ? <Chip tone="warn" icon="◐">Basis kuartal belum terverifikasi</Chip> : <Chip tone="good" icon="✓">Kuartal mandiri</Chip>}
            {savedAt && <Chip icon="↓">Diperbarui {formatDateTimeWib(savedAt)}</Chip>}
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={profit ? `Laba bersih ${profit.label}` : "Laba bersih"}
          value={profit ? formatCompactIdr(profit.value) : "—"}
          tone={!profit ? "muted" : profit.value >= 0 ? "neutral" : "down"}
          sub={profit?.yoyPct != null ? <span className={profit.yoyPct >= 0 ? "text-up-700" : "text-down-600"}>{profit.yoyPct >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(profit.yoyPct), 1).replace("+", "")} dari tahun lalu</span> : "Milik pemegang saham induk"}
        />
        <StatTile label="Pendapatan" value={latestRevenue !== null ? formatCompactIdr(latestRevenue) : "—"} tone={latestRevenue === null ? "muted" : "neutral"} sub={latestRevenue === null ? "Format laporan ini (mis. bank) tidak punya satu pos pendapatan" : profit?.label} />
        <StatTile label="Total aset" value={assets !== null ? formatCompactIdr(assets) : "—"} tone={assets === null ? "muted" : "neutral"} sub={by !== null ? `Posisi akhir ${qLabel(by, bq!)}` : undefined} />
        <StatTile label="Ekuitas (modal sendiri)" value={equity !== null ? formatCompactIdr(equity) : "—"} tone={equity === null ? "muted" : "neutral"} sub="Milik pemegang saham induk" />
      </dl>

      {bars.some((b) => b.value !== null) && (
        <div className="mt-6 rounded-md border border-ink-200 bg-card p-4 sm:p-5">
          <BarSeries data={bars} format="idr" title={`Laba bersih per kuartal (${bars.length} kuartal)`} height={170} unitNote={unverified ? "Batang pucat = basis kuartal belum terverifikasi; tidak dipakai menghitung rasio." : undefined} />
        </div>
      )}

      {assets !== null && assets > 0 && liabilities !== null && totalEquity !== null && (
        <CapitalStructure assets={assets} liabilities={liabilities} equity={totalEquity} period={qLabel(by!, bq!)} />
      )}

      <details className="group mt-5 rounded-md border border-ink-200 bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-ink-800 [&::-webkit-details-marker]:hidden">
          Tabel per kuartal ({allPeriods.length} periode)
          <span aria-hidden className="font-mono text-xs text-ink-400 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="overflow-x-auto border-t border-ink-200">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-ink-600">
                <th className="px-4 py-2.5 font-medium">Periode</th>
                {COLUMNS.map((c) => (
                  <th key={c.concept} className="px-3 py-2.5 text-right font-medium">
                    {c.concept === "eps_basic" ? <Term k="eps">{c.label}</Term> : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allPeriods.map(([y, q]) => (
                <tr key={`${y}Q${q}`} className="border-b border-ink-100 last:border-0 hover:bg-paper">
                  <td className="num px-4 py-2 font-semibold">{qLabel(y, q)}</td>
                  {COLUMNS.map((c) => {
                    const flow = !["total_assets", "equity_parent", "total_liabilities"].includes(c.concept);
                    const f = get(y, q, c.concept === "net_income" ? profitConcept : c.concept, flow);
                    const v = valueOf(f);
                    return (
                      <td
                        key={c.concept}
                        className={`num px-3 py-2 text-right ${v !== null && v < 0 ? "text-down-600" : ""} ${f?.period_basis === "quarter_unverified" ? "text-ink-500" : ""}`}
                        title={f ? `${BASIS_LABEL[f.period_basis] ?? f.period_basis}${f.validation && f.validation !== "ok" ? ` · ${f.validation}` : ""}` : "Tidak tersedia"}
                      >
                        {cell(v, c.perShare)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {latestByType.size > 0 && (
        <details className="group mt-3 rounded-md border border-ink-200 bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-ink-800 [&::-webkit-details-marker]:hidden">
            Laporan lengkap periode terbaru (apa adanya dari sumber)
            <span aria-hidden className="font-mono text-xs text-ink-400 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="grid gap-6 border-t border-ink-200 p-4 text-sm lg:grid-cols-3">
            {[...latestByType.values()].map((r) => (
              <div key={r.report_type}>
                <h3 className="mb-2 font-semibold">
                  {REPORT_LABEL[r.report_type] ?? r.report_type}{" "}
                  <span className="font-normal text-ink-500">
                    · {r.label ?? qLabel(r.fiscal_year, r.fiscal_quarter)}
                    {r.version > 1 ? ` · revisi ${r.version}` : ""}
                  </span>
                </h3>
                <ReportTree data={r.data} depth={0} />
              </div>
            ))}
          </div>
        </details>
      )}

      <HowToRead>
        <ul>
          <li>Semua angka dalam Rupiah. Laba dan pendapatan per kuartal; aset, liabilitas, dan ekuitas adalah posisi di akhir kuartal.</li>
          <li>
            Kami memeriksa apakah angka kuartal berdiri sendiri (bukan akumulasi sejak awal tahun) dengan mencocokkan jumlah 4 kuartal
            terhadap laporan tahunan. Yang belum terbukti ditampilkan pucat dan tidak dipakai untuk rasio.
          </li>
          {zeroMissing && <li>Pos yang bernilai 0 atau tidak konsisten di sumber ditampilkan &ldquo;—&rdquo; (tidak tersedia), bukan nol.</li>}
          <li>
            Diambil Pihak Ketiga {fetched ?? "—"} (waktu sumber). Tanggal publikasi resmi laporan tidak tersedia dari sumber, jadi tidak kami tampilkan.
          </li>
        </ul>
      </HowToRead>
    </>
  );
}

/** "Dari setiap Rp100 aset, berapa yang dibiayai liabilitas dan berapa modal sendiri." */
function CapitalStructure({ assets, liabilities, equity, period }: { assets: number; liabilities: number; equity: number; period: string }) {
  const l = (liabilities / assets) * 100;
  const e = (equity / assets) * 100;
  const other = Math.max(0, 100 - l - e);
  return (
    <figure className="mt-5 rounded-md border border-ink-200 bg-card p-4 sm:p-5">
      <figcaption className="text-sm font-medium text-ink-700">Struktur pendanaan · {period}</figcaption>
      <p className="mt-2 text-[1.0625rem] leading-relaxed text-ink-800">
        Dari setiap <strong>Rp100</strong> aset, <strong className="num">Rp{formatNumber(l, 0)}</strong> dibiayai liabilitas (utang, termasuk
        simpanan nasabah untuk bank) dan <strong className="num">Rp{formatNumber(e, 0)}</strong> dari modal sendiri.
      </p>
      <div className="mt-4 flex h-9 overflow-hidden rounded-md" role="img" aria-label={`Liabilitas ${formatNumber(l, 1)}%, ekuitas ${formatNumber(e, 1)}%${other >= 0.5 ? `, lainnya ${formatNumber(other, 1)}%` : ""}`}>
        <span className="flex items-center bg-ink-700 px-3 text-xs font-semibold text-paper" style={{ width: `${l}%` }}>
          {l > 14 && `Liabilitas ${formatNumber(l, 0)}%`}
        </span>
        {other >= 0.5 && <span className="border-x-2 border-card bg-ink-300" style={{ width: `${other}%` }} title={`Lainnya (mis. dana syirkah temporer) ${formatNumber(other, 1)}%`} />}
        <span className="flex items-center justify-end bg-kunyit-400 px-3 text-xs font-semibold text-ink-950" style={{ width: `${e}%` }}>
          {e > 14 && `Ekuitas ${formatNumber(e, 0)}%`}
        </span>
      </div>
      <p className="mt-2 text-xs text-ink-500">
        Total aset {formatCompactIdr(assets)}. Bank wajar memiliki porsi liabilitas besar karena simpanan nasabah tercatat sebagai liabilitas.
        {other >= 0.5 && ` Bagian abu-abu (${formatNumber(other, 1)}%) adalah pos di luar liabilitas dan ekuitas, mis. dana syirkah temporer.`}
      </p>
    </figure>
  );
}

function ReportTree({ data, depth }: { data: Record<string, unknown>; depth: number }) {
  if (depth > 4) return null;
  const entries = Object.entries(data).filter(([, v]) => typeof v === "number" || (v !== null && typeof v === "object"));
  return (
    <ul className={depth > 0 ? "ml-3 border-l border-ink-200 pl-2" : ""}>
      {entries.map(([key, value]) => {
        if (value !== null && typeof value === "object") {
          const obj = value as Record<string, unknown>;
          const total = typeof obj.total === "number" ? obj.total : null;
          const rest = Object.fromEntries(Object.entries(obj).filter(([k]) => k !== "total"));
          return (
            <li key={key} className="py-0.5">
              <span className="flex justify-between gap-3">
                <span className="text-ink-800">{humanize(key)}</span>
                {total !== null && <span className="num whitespace-nowrap">{formatCompact(total, 2)}</span>}
              </span>
              <ReportTree data={rest} depth={depth + 1} />
            </li>
          );
        }
        return (
          <li key={key} className="flex justify-between gap-3 py-0.5">
            <span className="text-ink-600">{humanize(key)}</span>
            <span className={`num whitespace-nowrap ${(value as number) === 0 ? "text-ink-400" : ""}`}>{formatCompact(value as number, 2)}</span>
          </li>
        );
      })}
    </ul>
  );
}

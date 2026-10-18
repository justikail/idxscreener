import { Term } from "@/components/Term";
import { Chip, EmptyState, HowToRead, SectionHeader } from "@/components/ui/section";
import { Tabs } from "@/components/ui/Tabs";
import type { SeasonalityResult } from "@/domain/seasonality";
import { formatDateTimeWib, formatPercent } from "@/lib/format";
import type { SeasonalPayload } from "@/server/ingestion/arjum-derived";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** Minimal tahun per bulan sebelum statistik ditampilkan sebagai pola. */
const MIN_YEARS = 3;

/** Skala divergen: hijau = naik, merah = turun, abu-abu di sekitar nol. Teks selalu tinta gelap. */
function cellTone(v: number | null): string {
  if (v === null) return "bg-transparent text-ink-300";
  if (v >= 0.1) return "bg-up-300 text-ink-950";
  if (v >= 0.04) return "bg-up-200 text-ink-950";
  if (v > 0.005) return "bg-up-100 text-ink-900";
  if (v >= -0.005) return "bg-ink-100 text-ink-800";
  if (v > -0.04) return "bg-down-100 text-ink-900";
  if (v > -0.1) return "bg-down-200 text-ink-950";
  return "bg-down-300 text-ink-950";
}

const LEGEND: Array<[string, string]> = [
  ["bg-down-300", "≤ −10%"],
  ["bg-down-200", "−4%"],
  ["bg-down-100", "< 0"],
  ["bg-ink-100", "±0"],
  ["bg-up-100", "> 0"],
  ["bg-up-200", "+4%"],
  ["bg-up-300", "≥ +10%"],
];

function Heatmap({ rows, currentMonth, footer }: { rows: Array<{ year: string; values: Array<number | null> }>; currentMonth: number; footer?: Array<{ label: string; cells: Array<{ text: string; dim: boolean }> }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-[3px] text-sm">
        <thead>
          <tr>
            <th className="w-14 text-left text-xs font-medium text-ink-500">Tahun</th>
            {MONTHS.map((m, i) => (
              <th key={m} scope="col" className={`pb-1 text-center text-xs font-medium ${i + 1 === currentMonth ? "text-ink-900" : "text-ink-500"}`}>
                {m}
                {i + 1 === currentMonth && <span className="mx-auto mt-0.5 block h-1 w-1 rounded-full bg-kunyit-500" aria-label="bulan ini" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year}>
              <th scope="row" className="num pr-2 text-left text-sm font-semibold">
                {row.year}
              </th>
              {row.values.map((v, i) => (
                <td
                  key={i}
                  className={`num h-10 rounded-[4px] text-center text-[13px] ${cellTone(v)} ${i + 1 === currentMonth ? "ring-1 ring-inset ring-kunyit-500" : ""}`}
                  title={v === null ? `${MONTHS_LONG[i]} ${row.year}: tidak ada data` : `${MONTHS_LONG[i]} ${row.year}: ${formatPercent(v * 100, 1)}`}
                >
                  {v === null ? "·" : formatPercent(v * 100, 1).replace("+", "")}
                </td>
              ))}
            </tr>
          ))}
          {footer?.map((f) => (
            <tr key={f.label}>
              <th scope="row" className="pr-2 pt-2 text-left text-xs font-medium text-ink-600">
                {f.label}
              </th>
              {f.cells.map((c, i) => (
                <td key={i} className={`num pt-2 text-center text-[13px] ${c.dim ? "text-ink-400" : "font-semibold text-ink-900"}`}>
                  {c.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600" aria-label="Legenda warna">
        {LEGEND.map(([cls, text]) => (
          <span key={text} className="inline-flex items-center gap-1.5">
            <span className={`h-3.5 w-5 rounded-sm border border-ink-300 ${cls}`} aria-hidden />
            {text}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3.5 w-5 rounded-sm ring-1 ring-inset ring-kunyit-500" aria-hidden />
          bulan ini
        </span>
      </div>
    </div>
  );
}

export function SeasonalitySection({
  id,
  result,
  provider,
  currentMonth,
}: {
  id: string;
  result: SeasonalityResult;
  provider?: { payload: SeasonalPayload; fetchedAt: Date } | null;
  currentMonth: number;
}) {
  const enough = result.months.some((m) => m.n >= MIN_YEARS);
  const ranked = result.months.filter((m) => m.n >= MIN_YEARS && m.median !== null).sort((a, b) => b.median! - a.median!);
  const thisMonth = result.months.find((m) => m.month === currentMonth);

  const takeaway =
    result.observedMonths === 0 ? (
      "Riwayat harga yang tersimpan belum mencakup satu bulan kalender penuh."
    ) : enough && ranked.length >= 2 ? (
      <>
        Dari riwayat {result.firstMonth} – {result.lastMonth}, bulan dengan median kenaikan tertinggi adalah <strong>{MONTHS_LONG[ranked[0]!.month - 1]}</strong> (
        {formatPercent(ranked[0]!.median! * 100, 1)}, {ranked[0]!.n} tahun) dan terendah <strong>{MONTHS_LONG[ranked.at(-1)!.month - 1]}</strong> (
        {formatPercent(ranked.at(-1)!.median! * 100, 1)}). Ini catatan masa lalu, bukan ramalan.
      </>
    ) : (
      <>
        Riwayat yang kami simpan baru <strong>{result.observedMonths} bulan</strong> — belum cukup untuk melihat pola musiman (butuh ≥ {MIN_YEARS} tahun
        per bulan).{provider ? ` Versi Pihak Ketiga mencakup ${provider.payload.years.length} tahun, tetapi metodenya berbeda.` : ""}
      </>
    );

  const own =
    result.observedMonths === 0 ? (
      <EmptyState title="Belum ada bulan lengkap untuk dihitung." icon="▦" />
    ) : (
      <>
        {thisMonth && thisMonth.n > 0 && (
          <p className="mb-4 rounded-md border border-ink-200 bg-card px-4 py-3 text-[1.0625rem] text-ink-800">
            <strong>{MONTHS_LONG[currentMonth - 1]}</strong> di masa lalu: naik {thisMonth.positive} dari {thisMonth.n} tahun tercatat
            {thisMonth.median !== null && `, median ${formatPercent(thisMonth.median * 100, 1)}`}.
            {thisMonth.n < MIN_YEARS && <span className="text-ink-500"> Sampel terlalu kecil untuk disebut pola.</span>}
          </p>
        )}
        <Heatmap
          currentMonth={currentMonth}
          rows={result.matrix.map((r) => ({ year: String(r.year), values: r.returns }))}
          footer={[
            { label: "Median", cells: result.months.map((m) => ({ text: m.median === null ? "·" : formatPercent(m.median * 100, 1), dim: m.n < MIN_YEARS })) },
            { label: "Naik / tahun", cells: result.months.map((m) => ({ text: m.n === 0 ? "·" : `${m.positive}/${m.n}`, dim: m.n < MIN_YEARS })) },
          ]}
        />
      </>
    );

  const providerPanel = provider ? (
    <>
      <p className="mb-4 rounded-md border border-kunyit-300 bg-kunyit-50 px-4 py-3 text-sm text-kunyit-900">
        Metode Pihak Ketiga tidak diketahui dan angkanya <strong>berbeda</strong> dari hitungan kami; bulan yang sedang berjalan ikut dihitung.
        Diambil {formatDateTimeWib(provider.fetchedAt)}.
      </p>
      <Heatmap
        currentMonth={currentMonth}
        rows={provider.payload.years.map((y) => ({
          year: y,
          values: MONTHS.map((_, i) => {
            const v = provider.payload.monthly[String(i + 1)]?.[y];
            return v === undefined ? null : v / 100;
          }),
        }))}
        footer={[
          {
            label: "Naik / tahun",
            cells: MONTHS.map((_, i) => {
              const c = provider.payload.counts[String(i + 1)];
              return { text: !c || c.up === null || c.total === null ? "·" : `${c.up}/${c.total}`, dim: false };
            }),
          },
        ]}
      />
    </>
  ) : null;

  return (
    <>
      <SectionHeader
        id={id}
        eyebrow="Kebiasaan harga per bulan"
        title="Pola bulanan"
        takeaway={takeaway}
        chips={!enough && result.observedMonths > 0 ? <Chip tone="warn" icon="◐">Riwayat {result.observedMonths} bulan</Chip> : undefined}
      />
      {providerPanel ? (
        <Tabs
          label="Sumber perhitungan pola bulanan"
          tabs={[
            { id: "kami", label: "Hitungan kami", badge: `${result.observedMonths} bln`, content: own },
            { id: "pihak-ketiga", label: "Versi Pihak Ketiga", badge: `${provider!.payload.years.length} thn`, content: providerPanel },
          ]}
        />
      ) : (
        own
      )}
      <HowToRead>
        <ul>
          <li>
            <Term k="seasonality">Hitungan kami</Term>: return bulan = penutupan terakhir bulan itu ÷ penutupan terakhir bulan sebelumnya − 1.
            Bulan berjalan dan bulan setelah celah data tidak dihitung.
          </li>
          <li>Harga belum terverifikasi disesuaikan aksi korporasi; pemecahan saham atau rights issue bisa menimbulkan lonjakan palsu.</li>
          <li>&ldquo;Naik / tahun&rdquo; adalah catatan masa lalu, bukan peluang naik di masa depan.</li>
        </ul>
      </HowToRead>
    </>
  );
}

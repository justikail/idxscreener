import { notFound } from "next/navigation";
import Link from "next/link";

import { DataModeBadge } from "@/components/DataModeBadge";
import { Pagination } from "@/components/Pagination";
import { Term } from "@/components/Term";
import { evaluateFilter, type CandidateMetrics, type ConditionEvaluation } from "@/domain/filter-ast";
import { SCREENING_PRESETS } from "@/domain/presets";
import { getMyWatchlistCodes } from "@/features/watchlist/actions";
import { isGlossaryKey, type GlossaryKey } from "@/lib/glossary";
import { formatCompactIdr, formatNumber, formatPercent, formatRatio, formatTradingDate } from "@/lib/format";
import { paginate, type SearchParamsRecord } from "@/lib/pagination";
import { visibleDataModes } from "@/server/data-mode";
import { getScreenerCandidates } from "@/server/db/queries";
import { FEATURES } from "@/lib/features";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

const FIELD_LABEL: Record<string, string> = {
  per: "PER",
  pbv: "PBV",
  roe: "ROE",
  roa: "ROA",
  npm: "NPM",
  der: "DER",
  rsi14: "RSI 14",
  volume_relative_20d: "Vol. relatif 20 sesi",
  price: "Harga",
  market_cap: "Kapitalisasi",
  foreign_net_ratio_5d: "Net asing 5 sesi",
};
const FIELD_TERM: Record<string, GlossaryKey> = { volume_relative_20d: "volume_relatif", market_cap: "kapitalisasi_pasar", foreign_net_ratio_5d: "asing_net" };
const termFor = (field: string): GlossaryKey | null => FIELD_TERM[field] ?? (isGlossaryKey(field) ? field : null);

const OP_LABEL: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" };

function formatValue(field: string, v: number | string | string[] | null): string {
  if (v === null) return "kosong";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "string") return v;
  if (["per", "pbv", "der", "volume_relative_20d"].includes(field)) return formatRatio(v);
  if (["roe", "roa", "npm"].includes(field)) return formatPercent(v * 100, 1).replace("+", "");
  if (field === "foreign_net_ratio_5d") return formatPercent(v * 100, 1);
  if (field === "market_cap") return formatCompactIdr(v);
  return formatNumber(v, 1);
}

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  // Dinonaktifkan sementara (src/lib/features.ts) — kode tetap untuk pengembangan berikutnya.
  if (!FEATURES.screenerKustom) notFound();
  const params = await searchParams;

  const [allCandidates, watched] = await Promise.all([getScreenerCandidates(), getMyWatchlistCodes()]);
  // Saham yang belum punya harga sama sekali (menunggu pengambilan awal) tidak
  // diuji — snapshot "data kosong" saja tidak dihitung sebagai punya data.
  const candidates = allCandidates.filter((c) => typeof c.values.price === "number");
  const awaitingData = allCandidates.length - candidates.length;
  const evaluate = (filter: (typeof SCREENING_PRESETS)[number]["filter"]) =>
    candidates.map((candidate) => {
      const metrics: CandidateMetrics = { instrumentId: candidate.instrumentId, values: candidate.values };
      return { candidate, evaluation: evaluateFilter(filter, metrics) };
    });

  // Per preset: berapa lolos, dan berapa yang datanya cukup untuk diuji sama sekali.
  const presetStats = new Map(
    SCREENING_PRESETS.map((p) => {
      const ev = evaluate(p.filter);
      return [p.code, { passed: ev.filter((e) => e.evaluation.passed).length, testable: ev.filter((e) => e.evaluation.missingFields.length === 0).length }];
    }),
  );
  // Tanpa pilihan eksplisit: preset pertama yang datanya cukup untuk diuji.
  const preset =
    SCREENING_PRESETS.find((p) => p.code === params.preset) ??
    SCREENING_PRESETS.find((p) => (presetStats.get(p.code)?.testable ?? 0) > 0) ??
    SCREENING_PRESETS[0]!;
  const pagerParams = { preset: preset.code, lolos: params.lolos, lolos_per: params.lolos_per, gagal: params.gagal, gagal_per: params.gagal_per, kurang: params.kurang, kurang_per: params.kurang_per };
  const evaluations = evaluate(preset.filter);
  const passed = evaluations.filter(({ evaluation }) => evaluation.passed);
  // Yang paling dekat lolos (kondisi terpenuhi terbanyak) ditampilkan lebih dulu.
  const metCount = (e: (typeof evaluations)[number]) => e.evaluation.reasons.filter((r) => r.met === true).length;
  const failed = evaluations.filter(({ evaluation }) => !evaluation.passed && evaluation.missingFields.length === 0).sort((a, b) => metCount(b) - metCount(a));
  const untestable = evaluations.filter(({ evaluation }) => !evaluation.passed && evaluation.missingFields.length > 0).sort((a, b) => metCount(b) - metCount(a));
  const passedPage = paginate(passed, params, "lolos", PER_PAGE);
  const notPassedPage = paginate(failed, params, "gagal", PER_PAGE);
  const untestablePage = paginate(untestable, params, "kurang", PER_PAGE);
  const missingByField = new Map<string, number>();
  for (const e of untestable) for (const f of e.evaluation.missingFields) missingByField.set(f, (missingByField.get(f) ?? 0) + 1);
  const stats = presetStats.get(preset.code)!;
  const modes = visibleDataModes();
  const mixed = modes.length > 1;
  const asOf = candidates.map((c) => c.asOf).filter(Boolean).sort().at(-1);

  return (
    <div className="flex flex-col gap-10">
      <section className="animate-rise">
        <p className="kicker flex flex-wrap items-center gap-3">
          <span>Penyaring saham · data per {asOf ? formatTradingDate(asOf, { weekday: false }) : "—"}</span>
          {!mixed && <DataModeBadge mode={modes[0]!} />}
        </p>
        <h1 className="mt-3 font-display text-5xl font-semibold leading-none tracking-tight sm:text-6xl">Screener</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-700">
          Setiap saham diuji terhadap aturan yang tertulis jelas. Anda melihat nilai aktualnya, ambang batasnya, dan
          kondisi mana yang gagal — tidak ada skor misterius. <span className="text-ink-500">Bukan rekomendasi transaksi.</span>
        </p>
      </section>

      <p className="-mb-7 text-sm text-ink-600">
        Pilih <Term k="preset" /> — angka besar = jumlah saham yang lolos
      </p>
      <nav aria-label="Pilih preset screener" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SCREENING_PRESETS.map((p, idx) => {
          const active = p.code === preset.code;
          const conds = p.filter.type === "group" ? p.filter.children : [p.filter];
          const st = presetStats.get(p.code)!;
          const lastOdd = idx === SCREENING_PRESETS.length - 1 && SCREENING_PRESETS.length % 2 === 1;
          return (
            <Link
              key={p.code}
              href={`/screener?preset=${p.code}`}
              aria-current={active ? "page" : undefined}
              className={`group flex flex-col gap-3 rounded-md border p-5 transition-colors ${lastOdd ? "sm:col-span-2 lg:col-span-1" : ""} ${
                active ? "border-ink-900 bg-ink-900 text-paper" : "border-ink-300 bg-card hover:border-ink-900"
              }`}
            >
              <span className="flex items-start justify-between gap-4">
                <span className="font-display text-xl font-semibold leading-tight">{p.name}</span>
                {st.testable > 0 && <span className={`num shrink-0 text-3xl font-semibold ${active ? "text-kunyit-400" : "text-ink-900"}`}>{st.passed}</span>}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {conds.map((c, i) =>
                  c.type === "condition" ? (
                    <span
                      key={i}
                      className={`num rounded-sm px-1.5 py-0.5 text-[11px] ${active ? "bg-ink-800 text-ink-200" : "bg-ink-100 text-ink-700"}`}
                    >
                      {FIELD_LABEL[c.field] ?? c.field} {OP_LABEL[c.operator] ?? c.operator} {formatValue(c.field, c.value)}
                    </span>
                  ) : null,
                )}
              </span>
              {st.testable === 0 ? (
                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-medium ${active ? "border-ink-600 text-ink-300" : "border-ink-300 text-ink-600"}`}>
                  ◌ Data belum cukup untuk preset ini
                </span>
              ) : (
                <span className={`text-xs ${active ? "text-ink-400" : "text-ink-500"}`}>saham lolos · {st.testable} saham datanya lengkap untuk diuji</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-b border-ink-900 pb-4">
        <p className="max-w-3xl text-[1.0625rem] leading-relaxed text-ink-800">{preset.description}</p>
      </div>

      {untestable.length > 0 && (
        <div className={`-mt-4 rounded-md border px-5 py-4 ${stats.testable === 0 ? "border-kunyit-300 bg-kunyit-50" : "border-ink-200 bg-card"}`}>
          <p className="text-[1.0625rem] text-ink-900">
            {stats.testable === 0 ? (
              <>
                <strong>Preset ini belum bisa dipakai.</strong> Belum ada saham dengan data lengkap untuk semua syaratnya.
              </>
            ) : (
              <>
                <strong>{untestable.length} saham belum bisa diuji</strong> karena sebagian datanya belum tersedia. Mereka tidak dihitung lolos.
              </>
            )}
          </p>
          <p className="mt-1 text-sm text-ink-700">
            Data yang kurang:{" "}
            {[...missingByField.entries()]
              .sort((x, y) => y[1] - x[1])
              .map(([f, n]) => `${FIELD_LABEL[f] ?? f} (${n} saham)`)
              .join(", ")}
            .{(missingByField.has("per") || missingByField.has("pbv") || missingByField.has("market_cap")) &&
              " PER, PBV, dan kapitalisasi butuh jumlah saham tercatat (diperbarui mingguan) dan laporan keuangan 4 kuartal."}
          </p>
        </div>
      )}

      <section id="lolos" className="scroll-mt-6">
        <h2 className="mb-3 flex items-baseline gap-3">
          <span className="section-title">Lolos</span>
          <span className="num text-ink-500">
            ({passed.length} dari {stats.testable} yang bisa diuji)
          </span>
        </h2>
        <Pagination variant="top" state={passedPage} path="/screener" params={pagerParams} paramKey="lolos" defaultSize={PER_PAGE} unit="saham lolos" anchor="lolos" />
        <ResultTable rows={passedPage.items} passed mixed={mixed} watched={watched} />
        <Pagination variant="bottom" state={passedPage} path="/screener" params={pagerParams} paramKey="lolos" defaultSize={PER_PAGE} unit="saham lolos" anchor="lolos" />
      </section>

      <section id="tidak-lolos" className="scroll-mt-6">
        <h2 className="mb-3 flex items-baseline gap-3">
          <span className="section-title">Tidak lolos</span>
          <span className="num text-ink-500">({failed.length})</span>
        </h2>
        {failed.length > 0 ? (
          <p className="mb-3 text-sm text-ink-500">Data lengkap, tetapi ada syarat yang tidak terpenuhi. Diurutkan dari yang paling mendekati lolos.</p>
        ) : (
          <p className="mb-3 text-sm text-ink-500">Tidak ada saham berdata lengkap yang gagal.</p>
        )}
        <Pagination variant="top" state={notPassedPage} path="/screener" params={pagerParams} paramKey="gagal" defaultSize={PER_PAGE} unit="saham tidak lolos" anchor="tidak-lolos" />
        {failed.length > 0 && <ResultTable rows={notPassedPage.items} passed={false} mixed={mixed} watched={watched} />}
        <Pagination variant="bottom" state={notPassedPage} path="/screener" params={pagerParams} paramKey="gagal" defaultSize={PER_PAGE} unit="saham tidak lolos" anchor="tidak-lolos" />
      </section>

      {untestable.length > 0 && (
        <section id="belum-diuji" className="scroll-mt-6">
          <details open={typeof params.kurang === "string"} className="group rounded-md border border-ink-200 bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="flex items-baseline gap-3">
                <span className="font-display text-2xl font-semibold">Belum bisa diuji</span>
                <span className="num text-ink-500">({untestable.length})</span>
              </span>
              <span className="text-sm text-ink-600">
                <span className="group-open:hidden">Tampilkan ▾</span>
                <span className="hidden group-open:inline">Sembunyikan ▴</span>
              </span>
            </summary>
            <div className="border-t border-ink-200 px-5 pb-4 pt-3">
              <p className="mb-3 text-sm text-ink-500">Data yang kosong ditandai &ldquo;kosong&rdquo;; saham ini tidak pernah dianggap memenuhi syarat.</p>
              <Pagination variant="top" state={untestablePage} path="/screener" params={pagerParams} paramKey="kurang" defaultSize={PER_PAGE} unit="saham" anchor="belum-diuji" />
              <ResultTable rows={untestablePage.items} passed={false} mixed={mixed} watched={watched} />
              <Pagination variant="bottom" state={untestablePage} path="/screener" params={pagerParams} paramKey="kurang" defaultSize={PER_PAGE} unit="saham" anchor="belum-diuji" />
            </div>
          </details>
        </section>
      )}
      {awaitingData > 0 && <p className="-mt-6 text-sm text-ink-500">{awaitingData} saham belum punya data harga sama sekali, jadi belum diuji.</p>}
    </div>
  );
}

function ResultTable({
  rows,
  passed,
  mixed,
  watched,
}: {
  rows: Array<{
    candidate: Awaited<ReturnType<typeof getScreenerCandidates>>[number];
    evaluation: ReturnType<typeof evaluateFilter>;
  }>;
  passed: boolean;
  mixed: boolean;
  watched: Set<string>;
}) {
  if (rows.length === 0) {
    return <p className="border-y border-ink-200 py-6 text-sm text-ink-500">Tidak ada saham pada kategori ini.</p>;
  }

  return (
    <>
      {/* Ponsel: kartu vertikal — alasan tidak disembunyikan di kolom yang harus digeser. */}
      <ul className="border-t border-ink-300 md:hidden">
        {rows.map(({ candidate, evaluation }) => (
          <li key={candidate.instrumentId} className={`border-b border-ink-200 py-3 ${passed ? "bg-up-50/60 px-2" : ""}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <Link href={`/saham/${candidate.code}`} className="num font-semibold hover:text-kunyit-700">
                  {watched.has(candidate.code) && <span aria-hidden className="mr-1 text-kunyit-500">★</span>}
                  {candidate.code}
                </Link>
                <span className="block truncate text-xs text-ink-500">{candidate.name}</span>
              </span>
              <span className="num shrink-0">{typeof candidate.values.price === "number" ? formatNumber(candidate.values.price) : "—"}</span>
            </div>
            {mixed && (
              <span className="mt-1.5 inline-block">
                <DataModeBadge mode={candidate.dataMode} />
              </span>
            )}
            <ul className="mt-2 flex flex-col items-start gap-1.5" aria-label="Alasan per kondisi">
              {evaluation.reasons.map((r, idx) => (
                <ReasonChip key={idx} reason={r} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="relative hidden overflow-x-auto md:block">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="kicker border-y border-ink-300 text-left">
            <th className="py-3 pr-4 font-normal">Saham</th>
            <th className="py-3 pr-4 text-right font-normal">Harga</th>
            <th className="py-3 font-normal">Mengapa {passed ? "lolos" : "tidak lolos"}?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ candidate, evaluation }) => (
            <tr key={candidate.instrumentId} className={`border-b border-ink-200 align-top ${passed ? "bg-up-50/60" : ""}`}>
              <td className="py-3 pr-4">
                <Link href={`/saham/${candidate.code}`} className="num font-semibold hover:text-kunyit-700">
                  {watched.has(candidate.code) && (
                    <span className="relative mr-1 text-kunyit-500" title="Ada di watchlist Anda">
                      <span aria-hidden>★</span>
                      <span className="sr-only">Di watchlist: </span>
                    </span>
                  )}
                  {candidate.code}
                </Link>
                <span className="block max-w-[16rem] truncate text-xs text-ink-500">{candidate.name}</span>
                {mixed && (
                  <span className="mt-1.5 inline-block">
                    <DataModeBadge mode={candidate.dataMode} />
                  </span>
                )}
              </td>
              <td className="num py-3 pr-4 text-right">
                {typeof candidate.values.price === "number" ? formatNumber(candidate.values.price) : "—"}
              </td>
              <td className="py-3">
                <ul className="flex flex-wrap gap-2" aria-label="Alasan per kondisi">
                  {evaluation.reasons.map((r, idx) => (
                    <ReasonChip key={idx} reason={r} />
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

function ReasonChip({ reason }: { reason: ConditionEvaluation }) {
  const state = reason.met === "unknown" ? "unknown" : reason.met ? "met" : "unmet";
  const styles = {
    met: "border-up-600 bg-up-50 text-up-800",
    unmet: "border-down-400 bg-down-50 text-down-800",
    unknown: "border-dashed border-ink-400 bg-card text-ink-600",
  }[state];
  const glyph = { met: "✓", unmet: "✕", unknown: "?" }[state];
  const verdict = { met: "terpenuhi", unmet: "tidak terpenuhi", unknown: "data tidak tersedia" }[state];
  const label = FIELD_LABEL[reason.field] ?? reason.field;
  const term = termFor(reason.field);

  return (
    <li
      className={`num inline-flex items-center gap-2 rounded-sm border px-2 py-1 text-xs ${styles}`}
      title={`${label} ${OP_LABEL[reason.operator] ?? reason.operator} ${formatValue(reason.field, reason.threshold)} — nilai aktual: ${formatValue(reason.field, reason.actual)} — ${verdict}`}
    >
      <span aria-hidden className="font-bold">
        {glyph}
      </span>
      <span>
        {term ? <Term k={term}>{label}</Term> : label} <span className="opacity-60">{OP_LABEL[reason.operator] ?? reason.operator} {formatValue(reason.field, reason.threshold)}</span>
      </span>
      <span className="border-l border-ink-900/15 pl-2 font-semibold">{formatValue(reason.field, reason.actual)}</span>
      <span className="sr-only">
        — nilai aktual: {formatValue(reason.field, reason.actual)} — {verdict}
      </span>
    </li>
  );
}

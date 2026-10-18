// ARSIP: halaman detail saham versi satu-halaman (sebelum dipecah per tab, 12 Okt 2026).
// Folder berawalan "_" tidak dijadikan rute oleh Next.js. Disimpan sebagai acuan
// fitur yang dinonaktifkan (pola bulanan, insider, catatan, pengingat, pengumuman, permintaan data).
import Link from "next/link";
import { notFound } from "next/navigation";

import { DataModeBadge } from "@/components/DataModeBadge";
import { Chip, EmptyState, FreshnessChip, HowToRead, SectionHeader, StatTile } from "@/components/ui/section";
import { SectionNav } from "@/components/ui/SectionNav";
import { AlertBuilder } from "@/features/alerts/alert-builder";
import { getMyAlerts } from "@/features/alerts/actions";
import { DataRequestPanel } from "@/features/requests/data-request-panel";
import { db } from "@/server/db/client";
import { chargedToday, datasetStatusForCode, getRequestSettings, myFollows } from "@/server/requests/core";
import { InsightGrid } from "@/features/market-data/insight-grid";
import { buildInsights } from "@/features/market-data/insights";
import { MetricTooltip } from "@/components/MetricTooltip";
import { Pagination } from "@/components/Pagination";
import { Term } from "@/components/Term";
import { Delta } from "@/components/market/Delta";
import { RangeBar, RsiScale } from "@/components/market/Gauges";
import { StockChart, type ChartBar } from "@/components/market/StockChart";
import { sma } from "@/domain/indicators";
import { monthlySeasonality } from "@/domain/seasonality";
import { AccumulationSection } from "@/features/market-data/accumulation-section";
import { BrokerSection, brokerHeadline, preferredRanges } from "@/features/market-data/broker-section";
import { InsidersSection, insiderSummary } from "@/features/market-data/insiders-section";
import { FinancialsSection, profitSummary } from "@/features/market-data/financials-section";
import { ForeignSection } from "@/features/market-data/foreign-section";
import { QuoteAndCap } from "@/features/market-data/quote-cap";
import { SeasonalitySection } from "@/features/market-data/seasonality-section";
import { getMyNotesForInstrument } from "@/features/notes/actions";
import { NotesSection } from "@/features/notes/notes-section";
import { WatchlistToggle } from "@/features/watchlist/add-button";
import { isInWatchlist } from "@/features/watchlist/actions";
import { formatCompact, formatCompactIdr, formatDateId, formatNumber, formatPercent, formatRatio, formatTradingDate } from "@/lib/format";
import { paginate, type SearchParamsRecord } from "@/lib/pagination";
import { auth } from "@/server/auth/config";
import {
  getAnnouncements,
  getDailyBars,
  getInstrumentByCode,
  getLatestMetricSnapshots,
} from "@/server/db/queries";
import {
  getAllCloses,
  getBrokerSummaryRanges,
  getDerivedSnapshot,
  getFetchCheckpoint,
  getInsiders,
  getBrokerSummaryRows,
  getForeignFlow,
  getLatestFacts,
  getLatestMarketCap,
  getLatestQuote,
  getLatestReports,
} from "@/server/db/arjum-queries";
import { quotaDateWib } from "@/server/quota/budget";
import type { AccumulationPayload, SeasonalPayload } from "@/server/ingestion/arjum-derived";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ok: "Tersedia",
  null_missing: "Data belum tersedia",
  not_applicable: "Tidak bermakna (not meaningful)",
  stale: "Data lampau (stale)",
  unavailable: "Tidak tersedia",
};

type Snapshot = { metric: string; value: string | null; status: string; unit: string | null };

const LIST_PER_PAGE = 10;

export async function StockDetailPageLengkap({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const instrument = await getInstrumentByCode(code);
  if (!instrument) notFound();

  const session = await auth();
  const [rawBars, { asOf, snapshots }, facts, announcements, notes, inWatchlist, reports, cap, quote, brokerRanges, foreign, allCloses] = await Promise.all([
    getDailyBars(instrument.id, 300),
    getLatestMetricSnapshots(instrument.id),
    getLatestFacts(instrument.id),
    getAnnouncements(instrument.id),
    session?.user ? getMyNotesForInstrument(instrument.id) : Promise.resolve([]),
    session?.user ? isInWatchlist(instrument.id) : Promise.resolve(false),
    getLatestReports(instrument.id),
    getLatestMarketCap(instrument.id),
    getLatestQuote(instrument.id),
    getBrokerSummaryRanges(instrument.id),
    getForeignFlow(instrument.id, 20),
    getAllCloses(instrument.id),
  ]);
  const [insiders, insiderState, accumulation, providerSeasonal] = await Promise.all([
    getInsiders(instrument.id),
    getFetchCheckpoint("insiders", instrument.code),
    getDerivedSnapshot(instrument.id, "broker_accumulation"),
    getDerivedSnapshot(instrument.id, "seasonal"),
  ]);
  const insiderPage = paginate(insiders, query, "insider", LIST_PER_PAGE);
  const insiderCp = insiderState?.checkpoint as { complete?: boolean; totalPages?: number; nextPage?: number } | null;
  const insiderNote = insiderCp
    ? insiderCp.complete
      ? "Seluruh riwayat dari sumber sudah tersimpan."
      : `Riwayat lama masih diambil bertahap (halaman ${Math.max(1, (insiderCp.nextPage ?? 2) - 1)} dari ${insiderCp.totalPages ?? "?"}).`
    : null;
  const brokerParam = typeof query.broker === "string" ? Number.parseInt(query.broker, 10) : NaN;
  const shownRanges = preferredRanges(brokerRanges);
  const selectedBroker = brokerRanges.find((r) => r.id === brokerParam) ?? shownRanges[0] ?? null;
  const brokerRows = selectedBroker ? await getBrokerSummaryRows(selectedBroker.id) : [];
  const seasonality = monthlySeasonality(
    allCloses.map((c) => ({ tradingDate: c.tradingDate, close: Number(c.close) })),
    quotaDateWib(),
  );
  const announcementPage = paginate(announcements, query, "peng", LIST_PER_PAGE);
  const notePage = paginate(notes, query, "catatan", LIST_PER_PAGE);
  const path = `/saham/${instrument.code}`;

  // Candlestick butuh OHLC lengkap; bar dengan salah satu nilai kosong tidak
  // digambar (tidak diisi angka buatan).
  const bars: ChartBar[] = rawBars
    .filter((b) => b.open !== null && b.high !== null && b.low !== null && b.close !== null)
    .map((b) => ({
      time: b.tradingDate,
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: b.volume !== null ? Number(b.volume) : null,
    }));
  const closes = bars.map((b) => b.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);

  const last = bars.at(-1) ?? null;
  const prev = bars.at(-2) ?? null;
  const changePct = last && prev && prev.close !== 0 ? ((last.close - prev.close) / prev.close) * 100 : null;
  const year = bars.slice(-250);
  const yearLow = year.length ? Math.min(...year.map((b) => b.low)) : null;
  const yearHigh = year.length ? Math.max(...year.map((b) => b.high)) : null;
  const lastRaw = rawBars.at(-1);

  const snap = (m: string) => snapshots.find((s) => s.metric === m);
  const num = (m: string) => {
    const s = snap(m);
    return s && (s.status === "ok" || s.status === "stale") && s.value !== null ? Number(s.value) : null;
  };
  const snapMetric = (m: string) => {
    const x = snap(m);
    return x ? { value: x.value === null ? null : Number(x.value), status: x.status } : undefined;
  };
  const rsiValue = num("rsi14");
  const sma20v = num("sma20");
  const sma50v = num("sma50");
  const macdHist = num("macd_histogram");
  const priceSnap = snap("price");

  const fundamentalMetrics = ["per", "pbv", "roe", "roa", "npm", "der"];
  const hasAnyFundamental = fundamentalMetrics.some((m) => snap(m)?.status === "ok" || snap(m)?.status === "not_applicable");

  const marketCapValue = num("market_cap");
  const passParams: Record<string, string> = Object.fromEntries(
    Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "broker"),
  );

  const today = quotaDateWib();
  const currentMonth = Number(today.slice(5, 7));
  const myAlerts = session?.user ? (await getMyAlerts()).filter((a) => a.instrumentId === instrument.id) : [];
  const requestNow = new Date();
  const [reqSettings, reqStatuses, reqUsed, follows] = await Promise.all([
    getRequestSettings(db),
    instrument.dataMode === "live" ? datasetStatusForCode(db, instrument.code, requestNow, session?.user?.id ?? null) : Promise.resolve(null),
    session?.user?.id ? chargedToday(db, session.user.id, requestNow) : Promise.resolve(0),
    session?.user?.id ? myFollows(db, session.user.id) : Promise.resolve([]),
  ]);
  const insiderSum = insiderSummary(insiders);
  const headline = brokerHeadline(brokerRows);
  const insights = buildInsights({
    close: last?.close ?? null,
    sma20: sma20v,
    sma50: sma50v,
    yearLow,
    yearHigh,
    sessionsInYear: year.length,
    per: snapMetric("per"),
    pbv: snapMetric("pbv"),
    roe: snapMetric("roe"),
    foreign: foreign.map((r) => ({ tradingDate: r.tradingDate, volume: r.volume === null ? null : Number(r.volume), net: r.foreignNet === null ? null : Number(r.foreignNet) })),
    broker: selectedBroker ? { date: selectedBroker.startDate, endDate: selectedBroker.endDate, coverage: selectedBroker.coverage, ...headline } : null,
    insiders,
    profit: profitSummary(facts),
    volume: {
      last: last?.volume ?? null,
      avg20: (() => {
        const v = bars.slice(-20).map((b) => b.volume).filter((x): x is number => x !== null);
        return v.length === 20 ? v.reduce((a, b) => a + b, 0) / 20 : null;
      })(),
    },
  });
  const hasFinancials = facts.length > 0 || reports.length > 0;
  const navSections = [
    { id: "grafik", label: "Grafik", hasData: bars.length >= 2 },
    { id: "teknikal", label: "Teknikal", hasData: rsiValue !== null },
    { id: "fundamental", label: "Rasio", hasData: hasAnyFundamental },
    { id: "keuangan", label: "Laporan keuangan", hasData: hasFinancials },
    { id: "asing", label: "Asing", hasData: foreign.some((r) => r.foreignNet !== null) },
    { id: "broker", label: "Broker", hasData: brokerRanges.length > 0 },
    { id: "insider", label: "Insider", hasData: insiders.length > 0 },
    { id: "musiman", label: "Pola bulanan", hasData: seasonality.observedMonths > 0 },
    { id: "pengumuman", label: "Pengumuman", hasData: announcements.length > 0 },
    { id: "pribadi", label: session?.user ? "Catatan & pengingat" : "Pengingat", hasData: notes.length > 0 || myAlerts.length > 0 },
  ];
  const alertCurrent = {
    price: last?.close,
    rsi14: rsiValue ?? undefined,
    per: num("per") ?? undefined,
    pbv: num("pbv") ?? undefined,
    roe: num("roe") ?? undefined,
    volume_relative_20d: num("volume_relative_20d") ?? undefined,
  };

  return (
    <div className="flex flex-col gap-10">
      {/* Kepala */}
      <section className="animate-rise">
        <nav aria-label="Lokasi" className="text-sm text-ink-500">
          <Link href="/saham" className="hover:text-ink-900">Saham</Link>
          <span className="mx-2" aria-hidden>/</span>
          {instrument.sectorName ?? "Sektor belum tersedia"}
          <span className="mx-2" aria-hidden>/</span>
          <Term k="papan">Papan {instrument.board}</Term>
        </nav>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="num text-6xl font-bold leading-none tracking-tight text-ink-900 sm:text-7xl">{instrument.code}</span>
              <span className="font-display text-2xl italic text-ink-600 sm:text-3xl">{instrument.name}</span>
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <DataModeBadge mode={instrument.dataMode} />
              {instrument.isBank && <Chip>Bank</Chip>}
              {session?.user ? (
                <WatchlistToggle instrumentCode={instrument.code} initialInWatchlist={inWatchlist} />
              ) : (
                <Link href="/masuk" className="rounded-full border border-ink-300 px-3 py-1 text-xs text-ink-700 hover:border-ink-900">
                  ☆ Masuk untuk memantau saham ini
                </Link>
              )}
            </div>
          </div>
          <div className="lg:text-right">
            <p className="num text-5xl font-semibold leading-none tracking-tight sm:text-6xl">
              <span className="mr-1 align-top text-xl text-ink-400">Rp</span>
              {last ? formatNumber(last.close) : "—"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 lg:justify-end">
              <Delta value={changePct} variant="pill" className="text-sm" />
              {prev && last && (
                <span className="num text-sm text-ink-600">
                  {last.close - prev.close >= 0 ? "+" : "−"}
                  {formatNumber(Math.abs(last.close - prev.close))} dari {formatNumber(prev.close)}
                </span>
              )}
              {priceSnap?.status === "stale" && <Chip tone="warn" icon="◷">Harga tertinggal</Chip>}
            </div>
            <p className="mt-2 text-sm text-ink-500">
              Penutupan {last ? formatTradingDate(last.time) : "—"} · <Term k="realtime">bukan harga realtime</Term>
            </p>
          </div>
        </div>

        {lastRaw && (
          <dl className="mt-6 grid grid-cols-3 overflow-hidden rounded-md border border-ink-200 bg-card sm:grid-cols-6">
            {[
              [<Term key="o" k="ohlc">Pembukaan</Term>, lastRaw.open !== null ? formatNumber(Number(lastRaw.open)) : "—"],
              ["Tertinggi", lastRaw.high !== null ? formatNumber(Number(lastRaw.high)) : "—"],
              ["Terendah", lastRaw.low !== null ? formatNumber(Number(lastRaw.low)) : "—"],
              [<Term key="v" k="volume">Volume (lembar)</Term>, lastRaw.volume !== null ? formatCompact(Number(lastRaw.volume), 2) : "—"],
              [<Term key="a" k="volume_avg20">Rata-rata vol. 20 sesi</Term>, (() => {
                const v = bars.slice(-20).map((b) => b.volume).filter((x): x is number => x !== null);
                return v.length === 20 ? formatCompact(v.reduce((a, b) => a + b, 0) / 20, 2) : "—";
              })()],
              [<Term key="k" k="kapitalisasi_pasar">Kapitalisasi</Term>, marketCapValue !== null ? formatCompactIdr(marketCapValue) : cap?.marketCap ? formatCompactIdr(Number(cap.marketCap)) : "—"],
            ].map(([label, value], i) => (
              <div key={i} className={`px-3 py-3 sm:px-4 ${i % 3 !== 0 ? "border-l border-ink-200" : ""} ${i >= 3 ? "border-t border-ink-200 sm:border-t-0" : ""} ${i === 3 ? "sm:border-l" : ""}`}>
                <dt className="text-xs text-ink-600">{label}</dt>
                <dd className="num mt-1 whitespace-nowrap text-base font-medium sm:text-lg">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <QuoteAndCap quote={quote} cap={cap} />
      </section>

      <InsightGrid code={instrument.code} insights={insights} asOf={last ? formatTradingDate(last.time, { weekday: false }) : null} />

      {reqStatuses && (
        <DataRequestPanel
          code={instrument.code}
          statuses={reqStatuses.map((x) => ({ ...x, lastSuccessAt: x.lastSuccessAt ? x.lastSuccessAt.toISOString() : null }))}
          loggedIn={Boolean(session?.user)}
          enabled={reqSettings.enabled}
          remaining={Math.max(0, reqSettings.perUserDaily - reqUsed)}
          perUserDaily={reqSettings.perUserDaily}
          following={follows.some((f) => f.instrumentId === instrument.id)}
          followCount={follows.length}
          maxFollows={reqSettings.maxFollows}
        />
      )}

      <SectionNav sections={navSections} label={`Isi halaman ${instrument.code}`} />

      <section aria-labelledby="grafik" className="scroll-mt-20">
        <SectionHeader
          id="grafik"
          eyebrow="Pergerakan harga"
          title="Grafik harian"
          chips={<FreshnessChip date={last?.time ?? null} today={today} />}
        />
        {bars.length >= 2 ? (
          <StockChart bars={bars} sma20={sma20} sma50={sma50} code={instrument.code} />
        ) : (
          <EmptyState title="Data harga belum cukup untuk menggambar grafik." icon="▁" />
        )}
        <HowToRead>
          <ul>
            <li><Term k="candlestick" />: badan hijau = harga ditutup lebih tinggi dari pembukaan, merah = lebih rendah. Sumbu bawah menunjukkan volume.</li>
            <li><Term k="sma" /> 20 dan 50 adalah rata-rata harga penutupan 20 dan 50 sesi terakhir — garis yang menghaluskan naik-turun harian.</li>
          </ul>
        </HowToRead>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="teknikal" className="scroll-mt-20">
          <SectionHeader
            id="teknikal"
            eyebrow="Dari pergerakan harga"
            title="Teknikal"
            chips={asOf ? <FreshnessChip date={asOf} today={today} label="Dihitung" /> : undefined}
          />
          <div className="space-y-6">
            <div className="rounded-md border border-ink-200 bg-card p-4">
              <p className="mb-2 text-sm text-ink-600">
                <MetricTooltip metric="rsi14" />
              </p>
              <RsiScale value={rsiValue} />
            </div>
            {yearLow !== null && yearHigh !== null && last && (
              <div className="rounded-md border border-ink-200 bg-card p-4">
                <RangeBar
                  low={yearLow}
                  high={yearHigh}
                  current={last.close}
                  label={<Term k="rentang_52">{`Rentang ${year.length} sesi terakhir (≈52 minggu)`}</Term>}
                />
              </div>
            )}
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <TrendCell label={<>vs <Term k="sma20" /></>} ma={sma20v} price={last?.close ?? null} />
              <TrendCell label={<>vs <Term k="sma50" /></>} ma={sma50v} price={last?.close ?? null} />
              <StatTile
                label={<>Histogram <Term k="macd" /></>}
                value={macdHist === null ? "—" : `${macdHist >= 0 ? "+" : "−"}${formatNumber(Math.abs(macdHist), 2)}`}
                tone={macdHist === null ? "muted" : macdHist >= 0 ? "up" : "down"}
                sub={macdHist === null ? "Riwayat belum cukup" : macdHist >= 0 ? "Momentum menguat" : "Momentum melemah"}
              />
            </dl>
          </div>
          <HowToRead>
            <p>
              Indikator dihitung dari harga penutupan tersimpan. Zona RSI 30/70 adalah konvensi umum, bukan sinyal beli/jual.{" "}
              <Link href="/tentang#perhitungan" className="underline underline-offset-2 hover:text-ink-900">Cara menghitung →</Link>
            </p>
          </HowToRead>
        </section>

        <section aria-labelledby="fundamental" className="scroll-mt-20">
          <SectionHeader id="fundamental" eyebrow="Dari laporan keuangan" title="Rasio fundamental" chips={<Chip><Term k="ttm" /></Chip>} />
          {!hasAnyFundamental && (
            <p className="mb-4 rounded-md border border-dashed border-ink-300 bg-card px-4 py-3 text-[0.9375rem] text-ink-700">
              Rasio baru dihitung setelah tersedia laporan keuangan 4 kuartal yang terverifikasi. Kami tidak menampilkan angka perkiraan.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fundamentalMetrics.map((m) => (
              <MetricItem key={m} metric={m} snapshot={snap(m)} />
            ))}
          </dl>
          <HowToRead>
            <ul>
              <li>PER & PBV memakai harga × saham tercatat terbaru; ROE, ROA, NPM memakai laba 12 bulan terakhir (4 kuartal mandiri).</li>
              <li>&ldquo;Tidak bermakna&rdquo; = pembaginya nol atau negatif (mis. rugi), jadi angka rasio akan menyesatkan.</li>
              <li>Bank dan nonbank sebaiknya tidak dibandingkan untuk DER karena simpanan nasabah tercatat sebagai liabilitas.</li>
            </ul>
          </HowToRead>
        </section>
      </div>

      <section aria-labelledby="keuangan" className="scroll-mt-20">
        <FinancialsSection id="keuangan" facts={facts} reports={reports} requestable={reqStatuses !== null} />
      </section>

      <section aria-labelledby="asing" className="scroll-mt-20">
        <ForeignSection id="asing" rows={foreign} today={today} />
      </section>

      <section aria-labelledby="broker" className="scroll-mt-20">
        <BrokerSection id="broker" path={path} ranges={shownRanges} selected={selectedBroker} rows={brokerRows} baseParams={passParams} requestable={reqStatuses !== null}>
          <AccumulationSection payload={(accumulation?.payload as AccumulationPayload | undefined) ?? null} fetchedAt={accumulation?.fetchedAt ?? null} />
        </BrokerSection>
      </section>

      <section aria-labelledby="insider" className="scroll-mt-20">
        <InsidersSection
          id="insider"
          rows={insiderPage.items}
          summary={insiderSum}
          fetchedNote={insiderNote}
          requestable={reqStatuses !== null}
          top={<Pagination variant="top" state={insiderPage} path={path} params={query} paramKey="insider" defaultSize={LIST_PER_PAGE} unit="laporan" anchor="insider" />}
          bottom={<Pagination variant="bottom" state={insiderPage} path={path} params={query} paramKey="insider" defaultSize={LIST_PER_PAGE} unit="laporan" anchor="insider" />}
        />
      </section>

      <section aria-labelledby="musiman" className="scroll-mt-20">
        <SeasonalitySection
          id="musiman"
          result={seasonality}
          currentMonth={currentMonth}
          provider={providerSeasonal ? { payload: providerSeasonal.payload as SeasonalPayload, fetchedAt: providerSeasonal.fetchedAt } : null}
        />
      </section>

      <section aria-labelledby="pengumuman" className="scroll-mt-20">
        <SectionHeader id="pengumuman" eyebrow="Dari emiten" title="Pengumuman" chips={announcements.length > 0 ? <Chip>{announcements.length} pengumuman</Chip> : undefined} />
        <Pagination variant="top" state={announcementPage} path={path} params={query} paramKey="peng" defaultSize={LIST_PER_PAGE} unit="pengumuman" anchor="pengumuman" />
        {announcements.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {announcementPage.items.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 rounded-md border border-ink-200 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <span className="text-[0.9375rem] leading-snug">{a.title}</span>
                <span className="num whitespace-nowrap text-sm text-ink-500">{formatDateId(a.publishedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Belum ada pengumuman untuk saham ini." icon="✉" />
        )}
        <Pagination variant="bottom" state={announcementPage} path={path} params={query} paramKey="peng" defaultSize={LIST_PER_PAGE} unit="pengumuman" anchor="pengumuman" />
      </section>

      <section aria-labelledby="pribadi" className="scroll-mt-20">
        <SectionHeader id="pribadi" eyebrow="Hanya untuk Anda" title={session?.user ? "Catatan & pengingat" : "Pengingat"} />
        {session?.user ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <AlertBuilder
              instrumentCode={instrument.code}
              current={alertCurrent}
              existing={myAlerts.map((a) => ({ id: a.id, metric: a.metric, operator: a.operator, threshold: a.threshold, isActive: a.isActive }))}
            />
            <div>
              <Pagination variant="top" state={notePage} path={path} params={query} paramKey="catatan" defaultSize={LIST_PER_PAGE} unit="catatan" anchor="pribadi" />
              <NotesSection instrumentCode={instrument.code} notes={notePage.items} />
              <Pagination variant="bottom" state={notePage} path={path} params={query} paramKey="catatan" defaultSize={LIST_PER_PAGE} unit="catatan" anchor="pribadi" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4 rounded-md border border-ink-200 bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[1.0625rem] text-ink-800">
              Masuk untuk memantau {instrument.code}, menulis catatan pribadi, dan mendapat pengingat saat harga atau RSI menyentuh angka pilihan Anda.
            </p>
            <div className="flex shrink-0 gap-2">
              <Link href="/masuk" className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-paper hover:bg-ink-700">Masuk</Link>
              <Link href="/daftar" className="rounded-full border border-ink-900 px-5 py-2 text-sm font-semibold hover:bg-ink-900 hover:text-paper">Daftar gratis</Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function TrendCell({ label, ma, price }: { label: React.ReactNode; ma: number | null; price: number | null }) {
  const diff = ma !== null && price !== null && ma !== 0 ? ((price - ma) / ma) * 100 : null;
  return (
    <StatTile
      label={label}
      value={diff === null ? "—" : formatPercent(diff, 1)}
      tone={diff === null ? "muted" : diff >= 0 ? "up" : "down"}
      sub={diff === null ? "Riwayat belum cukup" : `Harga ${diff >= 0 ? "di atas" : "di bawah"} rata-rata ${formatNumber(ma!)}`}
    />
  );
}

const METRIC_HINT: Record<string, string> = {
  per: "Berapa tahun laba untuk menebus harga",
  pbv: "Harga dibanding nilai buku",
  roe: "Laba dari modal sendiri",
  roa: "Laba dari seluruh aset",
  npm: "Laba bersih dari pendapatan",
  der: "Liabilitas dibanding ekuitas",
};

function MetricItem({ metric, snapshot }: { metric: string; snapshot: Snapshot | undefined }) {
  const ok = snapshot && snapshot.status === "ok" && snapshot.value !== null;
  return (
    <div className={`rounded-md border p-4 ${ok ? "border-ink-200 bg-card" : "border-dashed border-ink-300 bg-card/50"}`}>
      <dt className="text-sm text-ink-600">
        <MetricTooltip metric={metric} />
      </dt>
      <dd className={`mt-1.5 ${ok ? "num text-2xl font-semibold" : "text-sm font-medium text-ink-500"}`}>
        {ok ? (
          renderValue(metric, Number(snapshot!.value))
        ) : snapshot?.status === "not_applicable" ? (
          <Term k="tidak_bermakna">{STATUS_LABEL.not_applicable}</Term>
        ) : (
          STATUS_LABEL[snapshot?.status ?? "unavailable"]
        )}
      </dd>
      <dd className="mt-1 text-xs leading-snug text-ink-500">{METRIC_HINT[metric]}</dd>
    </div>
  );
}

function renderValue(metric: string, value: number): string {
  if (["per", "pbv", "der"].includes(metric)) return formatRatio(value);
  if (["roe", "roa", "npm"].includes(metric)) return formatPercent(value * 100).replace("+", "");
  return formatNumber(value, 2);
}

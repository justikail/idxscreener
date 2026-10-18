import { mulberry32, pick, randomInRange } from "./random";
import { tradingDaysEndingAt } from "./calendar";

export const DEMO_SEED = 20260919;
export const DEMO_ANCHOR_DATE = new Date("2026-09-19T00:00:00Z");
export const DEMO_SESSION_COUNT = 262;
export const DEMO_BATCH_ID = `demo-${DEMO_SEED}`;

export interface DemoSector {
  code: string;
  name: string;
}

export const DEMO_SECTORS: DemoSector[] = [
  { code: "FINANCE", name: "Keuangan" },
  { code: "ENERGY", name: "Energi" },
  { code: "CONSUMER", name: "Barang Konsumen Primer" },
  { code: "INDUSTRIAL", name: "Industri" },
  { code: "TECH", name: "Teknologi" },
  { code: "PROPERTY", name: "Properti dan Real Estat" },
  { code: "HEALTHCARE", name: "Kesehatan" },
];

export type DataQuirk =
  | "none"
  | "loss_making"
  | "negative_equity"
  | "stale_price"
  | "missing_quarter"
  | "zero_volume_days"
  // Kasus deterministik (bukan random walk) agar hasil preset screener dapat
  // diuji tanpa bergantung pada realisasi PRNG. Lihat generateDailyBars/
  // generateFinancialFacts untuk penanganan khusus tiap quirk.
  | "guaranteed_value_pass"
  | "guaranteed_value_fail"
  | "guaranteed_momentum_pass"
  | "guaranteed_momentum_fail";

export interface DemoInstrument {
  code: string;
  name: string;
  sectorCode: string;
  board: "utama" | "pengembangan" | "ekonomi_baru";
  isBank: boolean;
  listingDate: string;
  quirk: DataQuirk;
  basePrice: number;
  volatility: number; // proporsi pergerakan harian
  trend: number; // drift harian rata-rata
}

// 20 instrumen sintetis. Kode/nama fiktif dan tidak mengacu emiten riil, agar
// tidak disalahartikan sebagai data produksi. Mencakup bank & nonbank, rugi,
// ekuitas negatif, dan kasus data kosong/stale sesuai kriteria M1.
export const DEMO_INSTRUMENTS: DemoInstrument[] = [
  { code: "DEMA", name: "Bank Demo Artha Tbk", sectorCode: "FINANCE", board: "utama", isBank: true, listingDate: "2005-03-14", quirk: "none", basePrice: 4200, volatility: 0.012, trend: 0.0003 },
  { code: "DEMB", name: "Bank Demo Sentosa Tbk", sectorCode: "FINANCE", board: "utama", isBank: true, listingDate: "1998-11-02", quirk: "stale_price", basePrice: 1850, volatility: 0.015, trend: 0.0001 },
  { code: "SINT", name: "Sinar Interusaha Tbk", sectorCode: "FINANCE", board: "utama", isBank: false, listingDate: "2011-06-21", quirk: "none", basePrice: 980, volatility: 0.018, trend: 0.0002 },
  { code: "ENRG", name: "Energi Nusantara Raya Tbk", sectorCode: "ENERGY", board: "utama", isBank: false, listingDate: "2001-02-08", quirk: "none", basePrice: 3100, volatility: 0.022, trend: -0.0002 },
  { code: "TAMB", name: "Tambang Bara Jaya Tbk", sectorCode: "ENERGY", board: "utama", isBank: false, listingDate: "1997-07-19", quirk: "zero_volume_days", basePrice: 5400, volatility: 0.025, trend: 0.0000 },
  { code: "MIGA", name: "Migas Selat Timur Tbk", sectorCode: "ENERGY", board: "pengembangan", isBank: false, listingDate: "2016-04-11", quirk: "loss_making", basePrice: 340, volatility: 0.030, trend: -0.0008 },
  { code: "KONS", name: "Konsumer Sejahtera Tbk", sectorCode: "CONSUMER", board: "utama", isBank: false, listingDate: "1994-09-30", quirk: "none", basePrice: 6700, volatility: 0.010, trend: 0.0004 },
  { code: "MKNM", name: "Makanan Nusantara Makmur Tbk", sectorCode: "CONSUMER", board: "utama", isBank: false, listingDate: "2003-12-05", quirk: "none", basePrice: 1420, volatility: 0.014, trend: 0.0002 },
  { code: "RETA", name: "Retail Anggun Tbk", sectorCode: "CONSUMER", board: "utama", isBank: false, listingDate: "2013-10-17", quirk: "missing_quarter", basePrice: 890, volatility: 0.020, trend: -0.0001 },
  { code: "BAJA", name: "Baja Konstruksi Perkasa Tbk", sectorCode: "INDUSTRIAL", board: "utama", isBank: false, listingDate: "1999-05-22", quirk: "negative_equity", basePrice: 210, volatility: 0.035, trend: -0.0012 },
  { code: "MSIN", name: "Mesin Industri Presisi Tbk", sectorCode: "INDUSTRIAL", board: "utama", isBank: false, listingDate: "2007-08-09", quirk: "none", basePrice: 2650, volatility: 0.016, trend: 0.0003 },
  { code: "OTOM", name: "Otomotif Karya Bangsa Tbk", sectorCode: "INDUSTRIAL", board: "utama", isBank: false, listingDate: "1995-01-27", quirk: "none", basePrice: 7200, volatility: 0.013, trend: 0.0001 },
  { code: "TEKO", name: "Teknologi Awan Indonesia Tbk", sectorCode: "TECH", board: "ekonomi_baru", isBank: false, listingDate: "2021-07-08", quirk: "loss_making", basePrice: 480, volatility: 0.040, trend: 0.0010 },
  { code: "DIGI", name: "Digital Konektivitas Tbk", sectorCode: "TECH", board: "ekonomi_baru", isBank: false, listingDate: "2019-11-25", quirk: "none", basePrice: 1650, volatility: 0.028, trend: 0.0006 },
  { code: "PROP", name: "Properti Mahakarya Tbk", sectorCode: "PROPERTY", board: "utama", isBank: false, listingDate: "2000-03-03", quirk: "none", basePrice: 610, volatility: 0.017, trend: -0.0001 },
  { code: "REAL", name: "Realestat Cipta Kota Tbk", sectorCode: "PROPERTY", board: "utama", isBank: false, listingDate: "2010-02-14", quirk: "zero_volume_days", basePrice: 375, volatility: 0.021, trend: 0.0000 },
  { code: "FARM", name: "Farmasi Sehat Bersama Tbk", sectorCode: "HEALTHCARE", board: "utama", isBank: false, listingDate: "2008-06-16", quirk: "none", basePrice: 2980, volatility: 0.011, trend: 0.0005 },
  { code: "RSHS", name: "Rumah Sakit Harapan Sentosa Tbk", sectorCode: "HEALTHCARE", board: "utama", isBank: false, listingDate: "2017-09-12", quirk: "none", basePrice: 1980, volatility: 0.015, trend: 0.0003 },
  { code: "ASRI", name: "Asuransi Rakyat Inti Tbk", sectorCode: "FINANCE", board: "utama", isBank: false, listingDate: "2002-10-01", quirk: "none", basePrice: 720, volatility: 0.019, trend: 0.0001 },
  { code: "BATU", name: "Batu Bara Anugerah Tbk", sectorCode: "ENERGY", board: "utama", isBank: false, listingDate: "1996-12-20", quirk: "missing_quarter", basePrice: 4100, volatility: 0.024, trend: -0.0003 },
  // Empat instrumen di bawah ini deterministik (bukan random walk) agar preset
  // screener selalu punya minimal satu kandidat lolos dan satu kandidat gagal
  // yang bisa diuji otomatis, tidak hanya bergantung pada hasil acak populasi
  // di atas. Lihat generateDailyBars/generateFinancialFacts untuk detail.
  { code: "VPAS", name: "Valuasi Pasti Lolos Tbk", sectorCode: "CONSUMER", board: "utama", isBank: false, listingDate: "2012-01-10", quirk: "guaranteed_value_pass", basePrice: 1000, volatility: 0, trend: 0 },
  { code: "VFAI", name: "Valuasi Pasti Gagal Tbk", sectorCode: "CONSUMER", board: "utama", isBank: false, listingDate: "2012-01-10", quirk: "guaranteed_value_fail", basePrice: 1000, volatility: 0, trend: 0 },
  { code: "MPAS", name: "Momentum Pasti Lolos Tbk", sectorCode: "TECH", board: "pengembangan", isBank: false, listingDate: "2018-05-05", quirk: "guaranteed_momentum_pass", basePrice: 500, volatility: 0, trend: 0 },
  { code: "MFAI", name: "Momentum Pasti Gagal Tbk", sectorCode: "TECH", board: "pengembangan", isBank: false, listingDate: "2018-05-05", quirk: "guaranteed_momentum_fail", basePrice: 500, volatility: 0, trend: 0 },
];

export interface GeneratedBar {
  instrumentCode: string;
  tradingDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: bigint;
  value: number;
  frequency: number;
}

function seedFor(code: string, salt: string): number {
  let hash = 0;
  const s = `${code}:${salt}:${DEMO_SEED}`;
  for (let i = 0; i < s.length; i++) {
    hash = (Math.imul(hash, 31) + s.charCodeAt(i)) | 0;
  }
  return hash;
}

export function generateDailyBars(instrument: DemoInstrument): GeneratedBar[] {
  const dates = tradingDaysEndingAt(DEMO_ANCHOR_DATE, DEMO_SESSION_COUNT);
  const rand = mulberry32(seedFor(instrument.code, "bars"));

  const staleTailCut = instrument.quirk === "stale_price" ? 5 : 0;
  const effectiveDates = staleTailCut > 0 ? dates.slice(0, dates.length - staleTailCut) : dates;

  const bars: GeneratedBar[] = [];
  let prevClose = instrument.basePrice;
  // Kenaikan harian tetap untuk 25 sesi terakhir pada quirk "guaranteed_momentum_pass"
  // sehingga RSI14 mendekati 100 (kenaikan terus-menerus) secara deterministik,
  // bukan bergantung arah random walk. Lihat tests/domain untuk verifikasi RSI=100
  // pada deret naik terus-menerus.
  const momentumRunUpStart = effectiveDates.length - 25;

  for (let i = 0; i < effectiveDates.length; i++) {
    const tradingDate = effectiveDates[i]!;
    const isZeroVolumeDay =
      instrument.quirk === "zero_volume_days" && i > 0 && i % 47 === 0;

    const isMomentumSpike = instrument.quirk === "guaranteed_momentum_pass" && i >= momentumRunUpStart;
    const changePct = isMomentumSpike
      ? 0.01
      : randomInRange(rand, -instrument.volatility, instrument.volatility) + instrument.trend;
    let close = prevClose * (1 + changePct);
    close = Math.max(close, 20); // harga tidak boleh negatif/nol

    const intradayRange = close * randomInRange(rand, 0.005, instrument.volatility);
    const high = Math.max(prevClose, close) + intradayRange * rand();
    const low = Math.min(prevClose, close) - intradayRange * rand();
    const open = prevClose * (1 + randomInRange(rand, -0.004, 0.004));

    // Volume tetap + lonjakan pada sesi terakhir untuk "guaranteed_momentum_pass",
    // deterministik agar volume_relative_20d >= 1.2 tidak bergantung pada random.
    const isLastDay = i === effectiveDates.length - 1;
    let volume: bigint;
    if (isZeroVolumeDay) {
      volume = 0n;
    } else if (instrument.quirk === "guaranteed_momentum_pass") {
      volume = isLastDay ? 10_000_000n : 1_000_000n;
    } else {
      volume = BigInt(Math.floor(randomInRange(rand, 200_000, 45_000_000)));
    }
    const value = isZeroVolumeDay ? 0 : Number(volume) * close;
    const frequency = isZeroVolumeDay ? 0 : Math.floor(randomInRange(rand, 50, 4000));

    bars.push({
      instrumentCode: instrument.code,
      tradingDate,
      open: round2(open),
      high: round2(Math.max(high, open, close)),
      low: round2(Math.min(low, open, close)),
      close: round2(close),
      volume,
      value: round2(value),
      frequency,
    });

    prevClose = close;
  }

  return bars;
}

export type FinancialConcept =
  | "revenue"
  | "net_income"
  | "total_equity"
  | "total_liabilities"
  | "total_assets"
  | "eps_basic"
  | "eps_diluted"
  | "weighted_avg_shares";

export interface GeneratedFinancialFact {
  instrumentCode: string;
  fiscalYear: number;
  fiscalQuarter: number;
  concept: FinancialConcept;
  value: number | null;
  periodType: "instant" | "duration";
}

const QUARTER_END_MONTH_DAY: Record<number, [number, number]> = {
  1: [3, 31],
  2: [6, 30],
  3: [9, 30],
  4: [12, 31],
};

export function quarterPeriod(fiscalYear: number, fiscalQuarter: number): { start: string; end: string } {
  const [endMonth, endDay] = QUARTER_END_MONTH_DAY[fiscalQuarter]!;
  const startMonth = (fiscalQuarter - 1) * 3 + 1;
  const start = `${fiscalYear}-${String(startMonth).padStart(2, "0")}-01`;
  const end = `${fiscalYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  return { start, end };
}

/** Delapan kuartal terakhir berakhir Q2 2026 (dua kuartal sebelum anchor date). */
export function lastEightQuarters(): Array<{ fiscalYear: number; fiscalQuarter: number }> {
  const quarters: Array<{ fiscalYear: number; fiscalQuarter: number }> = [];
  let year = 2026;
  let quarter = 2;
  for (let i = 0; i < 8; i++) {
    quarters.unshift({ fiscalYear: year, fiscalQuarter: quarter });
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return quarters;
}

// Nilai kuartalan KONSTAN (bukan hasil PRNG) untuk instrumen "guaranteed_value_*":
// setiap kuartal identik sehingga TTM = 4x nilai kuartal secara eksak, dan
// PER/ROE hasil bagi bulat yang mudah diverifikasi di test tanpa floating point
// yang rawan geser. sharesOutstanding = 1 miliar lembar pada keduanya.
const GUARANTEED_VALUE_FACTS: Record<
  "guaranteed_value_pass" | "guaranteed_value_fail",
  { quarterlyRevenue: number; quarterlyNetIncome: number; equity: number; liabilities: number; shares: number }
> = {
  // PER = 1000 / (2e11*4/1e9... lihat perhitungan) -> didesain PER=5x, ROE=20%
  guaranteed_value_pass: {
    quarterlyRevenue: 500_000_000_000,
    quarterlyNetIncome: 50_000_000_000,
    equity: 1_000_000_000_000,
    liabilities: 200_000_000_000,
    shares: 1_000_000_000,
  },
  // Didesain PER=40x, ROE=3% -> keduanya gagal ambang preset "value_wajar"
  guaranteed_value_fail: {
    quarterlyRevenue: 312_500_000_000,
    quarterlyNetIncome: 6_250_000_000,
    equity: 833_333_333_333,
    liabilities: 400_000_000_000,
    shares: 1_000_000_000,
  },
};

export function generateFinancialFacts(instrument: DemoInstrument): GeneratedFinancialFact[] {
  if (instrument.quirk === "guaranteed_value_pass" || instrument.quirk === "guaranteed_value_fail") {
    const spec = GUARANTEED_VALUE_FACTS[instrument.quirk];
    const facts: GeneratedFinancialFact[] = [];
    for (const { fiscalYear, fiscalQuarter } of lastEightQuarters()) {
      const entries: Array<[FinancialConcept, number | null, "instant" | "duration"]> = [
        ["revenue", spec.quarterlyRevenue, "duration"],
        ["net_income", spec.quarterlyNetIncome, "duration"],
        ["total_equity", spec.equity, "instant"],
        ["total_liabilities", spec.liabilities, "instant"],
        ["total_assets", spec.equity + spec.liabilities, "instant"],
        ["eps_basic", round4(spec.quarterlyNetIncome / spec.shares), "duration"],
        ["eps_diluted", round4((spec.quarterlyNetIncome / spec.shares) * 0.98), "duration"],
        ["weighted_avg_shares", spec.shares, "instant"],
      ];
      for (const [concept, value, periodType] of entries) {
        facts.push({ instrumentCode: instrument.code, fiscalYear, fiscalQuarter, concept, value, periodType });
      }
    }
    return facts;
  }

  const rand = mulberry32(seedFor(instrument.code, "financials"));
  const quarters = lastEightQuarters();
  const facts: GeneratedFinancialFact[] = [];

  const baseRevenue = instrument.basePrice * randomInRange(rand, 800_000, 2_000_000);
  const baseShares = Math.floor(randomInRange(rand, 500_000_000, 20_000_000_000));
  let equity =
    instrument.quirk === "negative_equity"
      ? -Math.abs(baseRevenue * randomInRange(rand, 0.2, 0.5))
      : baseRevenue * randomInRange(rand, 1.5, 4);
  let liabilities = baseRevenue * randomInRange(rand, 1.2, 3.5);

  for (const { fiscalYear, fiscalQuarter } of quarters) {
    const skipThisQuarter =
      instrument.quirk === "missing_quarter" && fiscalYear === 2025 && fiscalQuarter === 3;

    const seasonality = 1 + 0.06 * Math.sin((fiscalQuarter / 4) * Math.PI * 2);
    const revenue = skipThisQuarter ? null : round2(baseRevenue * seasonality * randomInRange(rand, 0.9, 1.1));

    let margin = randomInRange(rand, 0.04, 0.16);
    if (instrument.quirk === "loss_making") margin = randomInRange(rand, -0.18, -0.02);
    const netIncome = skipThisQuarter || revenue === null ? null : round2(revenue * margin);

    liabilities = liabilities * randomInRange(rand, 0.97, 1.05);
    if (instrument.quirk !== "negative_equity") {
      equity = equity + (netIncome ?? 0) * randomInRange(rand, 0.3, 0.7);
    } else {
      equity = equity * randomInRange(rand, 0.98, 1.02);
    }
    const totalAssets = round2(Math.max(equity, 0) + liabilities);

    const epsBasic =
      netIncome === null ? null : round4((netIncome * 4) / baseShares); // estimasi EPS kuartalan disetahunkan hanya untuk demo generator, bukan output aplikasi
    const epsDiluted = epsBasic === null ? null : round4(epsBasic * 0.98);

    const entries: Array<[FinancialConcept, number | null, "instant" | "duration"]> = [
      ["revenue", revenue, "duration"],
      ["net_income", netIncome, "duration"],
      ["total_equity", skipThisQuarter ? null : round2(equity), "instant"],
      ["total_liabilities", skipThisQuarter ? null : round2(liabilities), "instant"],
      ["total_assets", skipThisQuarter ? null : totalAssets, "instant"],
      ["eps_basic", epsBasic, "duration"],
      ["eps_diluted", epsDiluted, "duration"],
      ["weighted_avg_shares", skipThisQuarter ? null : baseShares, "instant"],
    ];

    for (const [concept, value, periodType] of entries) {
      facts.push({ instrumentCode: instrument.code, fiscalYear, fiscalQuarter, concept, value, periodType });
    }
  }

  return facts;
}

export interface GeneratedAnnouncement {
  instrumentCode: string | null;
  title: string;
  category: string;
  publishedAt: string;
  daysAgo: number;
}

const ANNOUNCEMENT_TEMPLATES: Array<{ category: string; title: (name: string) => string }> = [
  { category: "laporan_keuangan", title: (n) => `Penyampaian Laporan Keuangan Interim - ${n}` },
  { category: "aksi_korporasi", title: (n) => `Pemberitahuan Rencana Pembagian Dividen - ${n}` },
  { category: "keterbukaan_informasi", title: (n) => `Keterbukaan Informasi Transaksi Afiliasi - ${n}` },
  { category: "rups", title: (n) => `Pemanggilan Rapat Umum Pemegang Saham - ${n}` },
  { category: "manajemen", title: (n) => `Perubahan Susunan Direksi dan Komisaris - ${n}` },
];

export function generateAnnouncements(instrument: DemoInstrument): GeneratedAnnouncement[] {
  const rand = mulberry32(seedFor(instrument.code, "announcements"));
  const count = Math.floor(randomInRange(rand, 3, 6));
  const announcements: GeneratedAnnouncement[] = [];

  for (let i = 0; i < count; i++) {
    const template = pick(rand, ANNOUNCEMENT_TEMPLATES);
    const daysAgo = Math.floor(randomInRange(rand, 1, 180));
    const publishedAt = new Date(DEMO_ANCHOR_DATE.getTime() - daysAgo * 86_400_000);
    announcements.push({
      instrumentCode: instrument.code,
      title: template.title(instrument.name),
      category: template.category,
      publishedAt: publishedAt.toISOString(),
      daysAgo,
    });
  }

  return announcements;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

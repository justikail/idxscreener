import type { ArjumBrokerSummaryResponse } from "@/server/providers/arjum/schemas";
import { coerceNumber } from "@/server/providers/arjum/schemas";

/**
 * Normalisasi /api/broker-summary. Satu respons = agregat SATU rentang
 * tanggal (broker_start_date..broker_end_date). Rentang berbeda tidak pernah
 * dijumlahkan (bisa tumpang tindih) — lihat docs/methodology.md.
 *
 * Kelengkapan & satuan TIDAK diasumsikan:
 * - Penyedia mengembalikan top-N broker (bawaan 20, audit 5 Okt). Hasil
 *   "complete" hanya bila jumlah volume beli semua broker sama dengan volume
 *   pasar reguler pada rentang yang sama (dari daily_bars, lembar).
 * - Bila jumlahnya = volume/100, satuan bvol/svol adalah lot.
 * - Selain itu "partial" (atau "unknown" bila volume harian tidak lengkap),
 *   dan total pasar TIDAK dihitung dari baris broker.
 */

export interface BrokerRow {
  brokerCode: string;
  brokerName: string | null;
  buyValue: number | null;
  buyVolume: number | null;
  buyFreq: number | null;
  sellValue: number | null;
  sellVolume: number | null;
  sellFreq: number | null;
  netValue: number | null;
  netVolume: number | null;
}

export interface BrokerCoverage {
  coverage: "complete" | "partial" | "unknown";
  volumeUnit: "shares" | "lots" | "unknown";
  note: string;
}

export interface NormalizedBrokerSummary {
  startDate: string;
  endDate: string;
  rows: BrokerRow[];
  flow: string | null;
  brokerNet: boolean | null;
  meta: Record<string, unknown>;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeBrokerSummary(
  response: ArjumBrokerSummaryResponse,
  code: string,
): { summary: NormalizedBrokerSummary | null; issues: string[] } {
  const issues: string[] = [];
  if (response.stock_code.toUpperCase() !== code.toUpperCase()) {
    return { summary: null, issues: [`stock_code "${response.stock_code}" ≠ ${code}; respons ditolak.`] };
  }
  const start = response.broker_start_date ?? null;
  const end = response.broker_end_date ?? null;
  if (!start || !end || !ISO.test(start) || !ISO.test(end) || start > end) {
    return { summary: null, issues: [`Rentang broker tidak valid (${start} – ${end}); respons ditolak.`] };
  }
  const seen = new Set<string>();
  const rows: BrokerRow[] = [];
  for (const r of response.brokers) {
    const codeUpper = r.broker_code.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(codeUpper)) {
      issues.push(`Kode broker tidak valid dilewati: ${r.broker_code.slice(0, 12)}`);
      continue;
    }
    if (seen.has(codeUpper)) {
      issues.push(`Broker ${codeUpper} muncul lebih dari sekali; duplikat dilewati.`);
      continue;
    }
    seen.add(codeUpper);
    const n = (v: unknown) => coerceNumber(v as number | string | null | undefined);
    const row: BrokerRow = {
      brokerCode: codeUpper,
      brokerName: typeof r.broker_name === "string" ? r.broker_name.slice(0, 256) : null,
      buyValue: n(r.bval),
      buyVolume: n(r.bvol),
      buyFreq: n(r.bfrq),
      sellValue: n(r.sval),
      sellVolume: n(r.svol),
      sellFreq: n(r.sfrq),
      netValue: n(r.nval),
      netVolume: n(r.nvol),
    };
    if ([row.buyValue, row.buyVolume, row.sellValue, row.sellVolume].some((v) => v !== null && v < 0)) {
      issues.push(`Broker ${codeUpper}: nilai beli/jual negatif; baris dilewati.`);
      continue;
    }
    rows.push(row);
  }
  const { flow, broker_net } = response;
  const omit = new Set(["stock_code", "brokers", "broker_start_date", "broker_end_date", "flow", "broker_net", "broker_levels"]);
  const rest = Object.fromEntries(Object.entries(response).filter(([k]) => !omit.has(k)));
  return {
    summary: {
      startDate: start,
      endDate: end,
      rows,
      flow: typeof flow === "string" ? flow.slice(0, 64) : null,
      brokerNet: typeof broker_net === "boolean" ? broker_net : null,
      meta: rest as Record<string, unknown>,
    },
    issues,
  };
}

/** Toleransi relatif — angka penyedia dibulatkan per broker. */
const TOLERANCE = 0.005;
const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE * Math.max(Math.abs(b), 1);

/**
 * Tentukan kelengkapan & satuan volume. `marketVolumeShares` = jumlah volume
 * daily_bars (lembar) untuk SETIAP sesi di rentang; null bila ada sesi yang
 * belum tersimpan. Pada satu transaksi, volume beli = volume jual = volume
 * transaksi, sehingga Σ volume beli semua broker = volume pasar.
 */
export function assessBrokerCoverage(rows: readonly BrokerRow[], marketVolumeShares: number | null): BrokerCoverage {
  if (rows.length === 0) return { coverage: "unknown", volumeUnit: "unknown", note: "Tidak ada baris broker." };
  if (rows.some((r) => r.buyVolume === null || r.sellVolume === null)) return { coverage: "unknown", volumeUnit: "unknown", note: "Ada volume beli/jual kosong; kelengkapan tidak dapat diuji." };
  const sumBuy = rows.reduce((s, r) => s + (r.buyVolume ?? 0), 0);
  const sumSell = rows.reduce((s, r) => s + (r.sellVolume ?? 0), 0);
  // Setiap transaksi punya satu pembeli dan satu penjual: bila SEMUA broker
  // ikut, Σ volume beli = Σ volume jual. Top-N saja hampir pasti tidak seimbang.
  const balanced = near(sumBuy, sumSell);

  if (marketVolumeShares !== null && marketVolumeShares > 0) {
    if (near(sumBuy, marketVolumeShares)) {
      return { coverage: "complete", volumeUnit: "shares", note: `Σ volume beli ${rows.length} broker = volume pasar sesi itu (lembar).` };
    }
    if (near(sumBuy * 100, marketVolumeShares)) {
      return { coverage: "complete", volumeUnit: "lots", note: `Σ volume beli ${rows.length} broker × 100 = volume pasar → satuan lot.` };
    }
    const shareRatio = sumBuy / marketVolumeShares;
    if (shareRatio > 1 + TOLERANCE) {
      return { coverage: "unknown", volumeUnit: "unknown", note: "Σ volume beli broker melebihi volume pasar; data tidak sebanding (tidak dianalisis)." };
    }
    // Sebagian broker: bila ditafsirkan lot, Σ×100 melampaui volume pasar → pasti lembar.
    const unit: BrokerCoverage["volumeUnit"] = sumBuy * 100 > marketVolumeShares * (1 + TOLERANCE) ? "shares" : "unknown";
    return {
      coverage: "partial",
      volumeUnit: unit,
      note:
        unit === "shares"
          ? `${rows.length} broker teratas mencakup ±${(shareRatio * 100).toFixed(1)}% volume pasar; bukan seluruh broker.`
          : `${rows.length} broker teratas; Σ volume tidak sama dengan volume pasar dan satuan belum dapat dipastikan.`,
    };
  }
  if (balanced) {
    return { coverage: "complete", volumeUnit: "unknown", note: `Σ volume beli = Σ volume jual ${rows.length} broker (seimbang); volume pasar rentang ini tidak diuji, satuan belum dipastikan.` };
  }
  return { coverage: "partial", volumeUnit: "unknown", note: `Σ volume beli ≠ Σ volume jual ${rows.length} broker → bukan seluruh broker.` };
}

/** Kunci parameter yang memengaruhi isi respons (rentang disimpan di kolom sendiri). */
export function brokerParamsKey(opts: { brokerLimit?: number; allData?: boolean }): string {
  return [opts.allData ? "all_data" : null, opts.brokerLimit !== undefined ? `limit=${opts.brokerLimit}` : null].filter(Boolean).join("&");
}

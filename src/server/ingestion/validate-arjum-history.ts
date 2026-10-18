import { coerceNumber, type ArjumHistoryResponse } from "@/server/providers/arjum/schemas";
import type { NormalizedDailyBar, ValidationIssue } from "./validate-daily-bars";

export interface ValidateArjumHistoryResult {
  validRows: NormalizedDailyBar[];
  issues: ValidationIssue[];
  /** Tanggal paling awal & akhir dari baris VALID (bukan dari permintaan). */
  firstDate: string | null;
  lastDate: string | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealCalendarDate(value: string): boolean {
  const m = value.match(ISO_DATE);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/**
 * Validasi riwayat OHLCV Arjum untuk SATU kode saham. Baris anomali
 * DIKARANTINA (dikecualikan + dicatat sebagai issue), bukan diperbaiki. Sesuai
 * AGENTS.md §8:
 * - high >= low, open/close di dalam [low, high] bila nilainya ada;
 * - harga/volume negatif ditolak; harga 0 dengan volume > 0 ditolak;
 * - close null dikecualikan (indikator tidak boleh memperlakukan null sebagai 0);
 * - volume 0 dengan close terisi = hari tanpa transaksi (normal, bukan data hilang);
 * - tanggal harus YYYY-MM-DD kalender valid dan tidak di masa depan (WIB).
 */
export function validateArjumHistory(
  response: ArjumHistoryResponse,
  requestedCode: string,
  todayWib: string,
): ValidateArjumHistoryResult {
  const issues: ValidationIssue[] = [];
  const code = requestedCode.toUpperCase();

  if (response.stock_code.toUpperCase() !== code) {
    issues.push({
      severity: "error",
      code: "stock_code_mismatch",
      message: `Respons berisi stock_code "${response.stock_code}" padahal yang diminta ${code} — seluruh respons ditolak.`,
      stockCode: code,
    });
    return { validRows: [], issues, firstDate: null, lastDate: null };
  }

  if (response.rows.length === 0) {
    issues.push({
      severity: "warning",
      code: "empty_history",
      message: `Riwayat ${code} kosong. Tidak disimpulkan sebagai suspensi/delisting tanpa bukti lain.`,
      stockCode: code,
    });
    return { validRows: [], issues, firstDate: null, lastDate: null };
  }

  const seen = new Set<string>();
  const validRows: NormalizedDailyBar[] = [];

  for (const row of response.rows) {
    const quarantine = (issueCode: string, message: string) =>
      issues.push({ severity: "error", code: issueCode, message: `[${row.date}] ${message}`, stockCode: code });

    if (!isRealCalendarDate(row.date)) {
      quarantine("invalid_date", `Tanggal "${row.date}" bukan YYYY-MM-DD yang valid.`);
      continue;
    }
    if (row.date > todayWib) {
      quarantine("future_date", `Tanggal di masa depan relatif terhadap hari ini (WIB ${todayWib}).`);
      continue;
    }
    if (seen.has(row.date)) {
      quarantine("duplicate_date", "Tanggal muncul lebih dari sekali — baris duplikat dikecualikan.");
      continue;
    }

    const open = coerceNumber(row.open);
    const high = coerceNumber(row.high);
    const low = coerceNumber(row.low);
    const close = coerceNumber(row.close);
    const volume = coerceNumber(row.volume);
    const value = coerceNumber(row.value);
    const frequency = coerceNumber(row.freq);

    if (close === null) {
      quarantine("missing_close", "Harga penutupan kosong — tidak disimpan (null tidak boleh menjadi 0).");
      continue;
    }

    const prices = [open, high, low, close].filter((p): p is number => p !== null);
    if (prices.some((p) => p < 0) || (volume !== null && volume < 0) || (value !== null && value < 0)) {
      quarantine("negative_value", "Harga/volume/nilai negatif.");
      continue;
    }
    if (close === 0 && volume !== null && volume > 0) {
      quarantine("zero_price_with_volume", "Harga 0 padahal ada volume transaksi.");
      continue;
    }
    if (high !== null && low !== null) {
      if (high < low) {
        quarantine("high_below_low", `high (${high}) < low (${low}).`);
        continue;
      }
      const outOfRange = [open, close].some((p) => p !== null && (p > high || p < low));
      if (outOfRange) {
        quarantine("ohlc_out_of_range", `open/close di luar rentang [low ${low}, high ${high}].`);
        continue;
      }
    }

    if (volume !== null && !Number.isInteger(volume)) {
      // Volume lembar seharusnya bilangan bulat; pecahan menandakan salah
      // tafsir satuan. Dikarantina, bukan dibulatkan diam-diam.
      quarantine("fractional_volume", `Volume ${volume} bukan bilangan bulat (diharapkan lembar).`);
      continue;
    }

    const foreign = normalizeForeign(row, volume);
    if (foreign.issue) {
      issues.push({ severity: "warning", code: "foreign_inconsistent", message: `[${row.date}] ${foreign.issue}`, stockCode: code });
    }

    seen.add(row.date);
    validRows.push({
      instrumentCode: code,
      instrumentName: null,
      tradingDate: row.date,
      open,
      high,
      low,
      close,
      previous: null,
      volume,
      value,
      frequency,
      hasTransaction: volume !== null && volume > 0,
      foreign: { buy: foreign.buy, sell: foreign.sell, net: foreign.net },
    });
  }

  validRows.sort((a, b) => (a.tradingDate < b.tradingDate ? -1 : a.tradingDate > b.tradingDate ? 1 : 0));

  return {
    validRows,
    issues,
    firstDate: validRows[0]?.tradingDate ?? null,
    lastDate: validRows[validRows.length - 1]?.tradingDate ?? null,
  };
}

/**
 * Volume asing f_buy/f_sell/n_foreign (lembar). Bukti satuan: pada setiap
 * baris teramati f_buy, f_sell <= volume (lembar); bila lot, ×100 akan
 * melampaui volume. Baris yang melanggar, atau n_foreign != f_buy − f_sell,
 * disimpan TANPA data asing (null) dan dicatat — candle OHLCV tetap valid.
 * Ini volume, bukan nilai Rupiah; tidak dikalikan harga.
 */
export function normalizeForeign(
  row: { f_buy?: number | string | null; f_sell?: number | string | null; n_foreign?: number | string | null },
  volume: number | null,
): { buy: number | null; sell: number | null; net: number | null; issue: string | null } {
  const buy = coerceNumber(row.f_buy);
  const sell = coerceNumber(row.f_sell);
  const net = coerceNumber(row.n_foreign);
  const none = { buy: null, sell: null, net: null };
  if (buy === null && sell === null && net === null) return { ...none, issue: null };
  if (buy === null || sell === null) return { ...none, issue: "Data asing tidak lengkap (f_buy/f_sell kosong); tidak disimpan." };
  if (buy < 0 || sell < 0 || !Number.isInteger(buy) || !Number.isInteger(sell)) return { ...none, issue: `f_buy/f_sell tidak valid (${buy}/${sell}); tidak disimpan.` };
  if (volume !== null && (buy > volume || sell > volume)) return { ...none, issue: `f_buy/f_sell (${buy}/${sell}) melebihi volume ${volume}; satuan tidak sesuai, tidak disimpan.` };
  if (net !== null && net !== buy - sell) return { ...none, issue: `n_foreign ${net} ≠ f_buy − f_sell (${buy - sell}); tidak disimpan.` };
  return { buy, sell, net: buy - sell, issue: null };
}

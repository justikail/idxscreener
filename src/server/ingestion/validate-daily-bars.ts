import type { RawDailyBarRow } from "@/server/providers/types";

export interface ValidationIssue {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  stockCode?: string;
}

export interface NormalizedDailyBar {
  instrumentCode: string;
  instrumentName: string | null;
  tradingDate: string; // YYYY-MM-DD, sudah divalidasi sesuai tanggal diminta
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  previous: number | null;
  volume: number | null;
  value: number | null;
  frequency: number | null;
  /** volume 0 dengan close terisi = tidak ada transaksi hari itu, BUKAN data
   * hilang (AGENTS.md §8, §5 — temuan riset mengonfirmasi ini pola normal). */
  hasTransaction: boolean;
  /** Volume beli/jual/net investor asing (lembar). Hanya sumber yang menyediakannya (Arjum). */
  foreign?: { buy: number | null; sell: number | null; net: number | null };
}

export interface ValidateDailyBarsResult {
  validRows: NormalizedDailyBar[];
  issues: ValidationIssue[];
}

const DUMMY_PATTERN = /DUMMY/i;

/**
 * Mengubah tanggal seperti dilaporkan sumber (`row.Date`, format belum pasti —
 * lihat docs/data-sources.md) menjadi YYYY-MM-DD. Mencoba beberapa pola yang
 * umum dari serializer .NET/ASP.NET tanpa menebak-nebak berlebihan; format
 * yang tidak dikenali menghasilkan null (baris DIKECUALIKAN, bukan dipaksakan).
 */
export function tryParseSourceDate(raw: string): string | null {
  const trimmed = raw.trim();

  // ISO 8601 atau "YYYY-MM-DDTHH:mm:ss"
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // /Date(1691971200000)/ — format JSON.NET lama untuk DateTime
  const msMatch = trimmed.match(/^\/Date\((\d+)([+-]\d{4})?\)\/$/);
  if (msMatch) {
    const ms = Number(msMatch[1]);
    if (Number.isFinite(ms)) {
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  return null;
}

function toYmd(dateParam: string): string {
  // dateParam bisa "20260814" (format request) atau sudah "2026-08-14".
  if (/^\d{8}$/.test(dateParam)) {
    return `${dateParam.slice(0, 4)}-${dateParam.slice(4, 6)}-${dateParam.slice(6, 8)}`;
  }
  return dateParam;
}

/**
 * Validasi + normalisasi SATU batch daily bars sesuai aturan wajib AGENTS.md
 * §6, §8, §11 dan instruksi M3: tanggal dataset sesuai permintaan, key unik,
 * tipe/satuan diketahui, data kosong ≠ volume nol, kode DUMMY dikecualikan,
 * field tak dikenal tidak jadi metrik diam-diam.
 */
export function validateAndNormalizeDailyBars(
  rows: RawDailyBarRow[],
  requestedDateParam: string,
): ValidateDailyBarsResult {
  const issues: ValidationIssue[] = [];
  const requestedYmd = toYmd(requestedDateParam);

  if (rows.length === 0) {
    issues.push({
      severity: "info",
      code: "empty_response",
      message:
        `Provider mengembalikan array kosong untuk ${requestedYmd}. TIDAK diasumsikan hari libur — ` +
        `perlu diverifikasi manual terhadap kalender bursa resmi sebelum disimpulkan.`,
    });
    return { validRows: [], issues };
  }

  const seenCodes = new Set<string>();
  const validRows: NormalizedDailyBar[] = [];

  for (const row of rows) {
    const code = row.stockCode.trim().toUpperCase();

    if (DUMMY_PATTERN.test(row.stockCode) || (row.stockName && DUMMY_PATTERN.test(row.stockName))) {
      issues.push({
        severity: "warning",
        code: "dummy_row_excluded",
        message: `Baris dengan indikasi kode/nama DUMMY dikecualikan dari publikasi (AGENTS.md §5).`,
        stockCode: code,
      });
      continue;
    }

    if (seenCodes.has(code)) {
      issues.push({
        severity: "error",
        code: "duplicate_stock_code",
        message: `Kode ${code} muncul lebih dari sekali pada tanggal yang sama — baris duplikat dikecualikan.`,
        stockCode: code,
      });
      continue;
    }

    const parsedDate = tryParseSourceDate(row.tradingDate);
    if (!parsedDate) {
      issues.push({
        severity: "error",
        code: "unparseable_date",
        message: `Field tanggal baris ("${row.tradingDate}") tidak bisa diparse ke YYYY-MM-DD — baris dikecualikan.`,
        stockCode: code,
      });
      continue;
    }

    if (parsedDate !== requestedYmd) {
      issues.push({
        severity: "error",
        code: "date_mismatch",
        message: `Tanggal baris (${parsedDate}) tidak cocok dengan tanggal diminta (${requestedYmd}) — baris dikecualikan, bukan dipaksa cocok.`,
        stockCode: code,
      });
      continue;
    }

    if (row.close === null && row.open === null && row.high === null && row.low === null) {
      issues.push({
        severity: "warning",
        code: "no_price_data",
        message: `Baris tanpa data harga sama sekali (open/high/low/close semua kosong).`,
        stockCode: code,
      });
    }

    const volume = row.volume ?? null;
    const hasTransaction = volume !== null && volume > 0;
    if (volume === 0 && row.close !== null) {
      // Sesuai dokumentasi: normal, BUKAN indikasi data hilang. Tidak perlu
      // issue — dicatat di komentar kode saja agar tidak salah dianggap bug.
    }

    seenCodes.add(code);
    validRows.push({
      instrumentCode: code,
      instrumentName: row.stockName,
      tradingDate: parsedDate,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      previous: row.previous,
      volume,
      value: row.value,
      frequency: row.frequency,
      hasTransaction,
    });
  }

  return { validRows, issues };
}

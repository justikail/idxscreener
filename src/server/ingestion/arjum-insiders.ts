import { createHash } from "node:crypto";

/**
 * /api/insiders/{code}. Bentuk teramati (probe 6 Okt 2026, BBCA): pagination
 * `page/page_size(10)/total/total_pages/count`, `items[]` dengan name, date,
 * action_type, nationality, previous/current/changes_value (string berformat
 * "7,502,058" / "+317,892"), *_percentage (string, persen), price_formatted,
 * broker_code, badges. Tidak ada ID penyedia.
 *
 * Satuan: *_value = LEMBAR (bukti: 7.502.058 lembar ÷ ±123,3 miliar saham BBCA
 * ≈ 0,0061% = previous_percentage). *_percentage = persen kepemilikan.
 * action_type disimpan apa adanya (mis. "buy") — tidak ditafsirkan sebagai
 * transaksi di pasar reguler.
 */

export interface InsiderRow {
  dedupKey: string;
  holderName: string;
  txDate: string;
  actionType: string;
  nationality: string | null;
  badges: string[];
  previousShares: number | null;
  previousPct: number | null;
  currentShares: number | null;
  currentPct: number | null;
  changeShares: number | null;
  changePct: number | null;
  price: number | null;
  brokerCode: string | null;
  raw: Record<string, unknown>;
}

/** "7,502,058" / "+317,892" / "-1,000" / "0.0061" → angka; selain itu null (bukan 0). */
export function parseFormatted(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!/^[+-]?[\d,]+(\.\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Kunci dedup komposit: nama + tanggal + aksi + kepemilikan sebelum & sesudah.
 * Dua laporan berbeda pada hari yang sama untuk orang yang sama hampir pasti
 * berbeda kepemilikan sebelum/sesudahnya; baris identik = laporan yang sama.
 */
export function insiderDedupKey(r: { holderName: string; txDate: string; actionType: string; previousShares: number | null; currentShares: number | null }): string {
  return createHash("sha256")
    .update([r.holderName.trim().toUpperCase(), r.txDate, r.actionType.toLowerCase(), r.previousShares ?? "", r.currentShares ?? ""].join("|"))
    .digest("hex");
}

export interface InsiderPage {
  rows: InsiderRow[];
  page: number | null;
  totalPages: number | null;
  total: number | null;
  issues: string[];
}

export function normalizeInsiders(body: Record<string, unknown>, code: string): InsiderPage {
  const issues: string[] = [];
  if (typeof body.stock_code === "string" && body.stock_code.toUpperCase() !== code.toUpperCase()) {
    return { rows: [], page: null, totalPages: null, total: null, issues: [`stock_code "${body.stock_code}" ≠ ${code}; respons ditolak.`] };
  }
  const items = Array.isArray(body.items) ? body.items : null;
  if (!items) return { rows: [], page: null, totalPages: null, total: null, issues: ["Respons tanpa items[]; ditolak."] };
  const rows: InsiderRow[] = [];
  const seen = new Set<string>();
  for (const raw of items as Array<Record<string, unknown>>) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const date = typeof raw.date === "string" ? raw.date : "";
    const action = typeof raw.action_type === "string" ? raw.action_type.trim().toLowerCase() : "";
    if (!name || !ISO.test(date) || !/^[a-z_]{1,32}$/.test(action)) {
      issues.push(`Baris insider tanpa nama/tanggal/aksi valid dilewati.`);
      continue;
    }
    const base = {
      holderName: name.slice(0, 256),
      txDate: date,
      actionType: action,
      previousShares: parseFormatted(raw.previous_value),
      currentShares: parseFormatted(raw.current_value),
    };
    const changeShares = parseFormatted(raw.changes_value);
    if (base.previousShares !== null && base.currentShares !== null && changeShares !== null && base.currentShares - base.previousShares !== changeShares) {
      issues.push(`[${name} ${date}] perubahan ${changeShares} ≠ sesudah − sebelum; disimpan apa adanya.`);
    }
    const dedupKey = insiderDedupKey(base);
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const brokerCode = typeof raw.broker_code === "string" && raw.broker_code.trim() ? raw.broker_code.trim().slice(0, 16) : null;
    rows.push({
      ...base,
      dedupKey,
      nationality: typeof raw.nationality === "string" ? raw.nationality.slice(0, 32) : null,
      badges: Array.isArray(raw.badges) ? raw.badges.filter((b): b is string => typeof b === "string").map((b) => b.slice(0, 64)) : [],
      previousPct: parseFormatted(raw.previous_percentage),
      currentPct: parseFormatted(raw.current_percentage),
      changeShares,
      changePct: parseFormatted(raw.changes_percentage),
      price: parseFormatted(raw.price_formatted),
      brokerCode,
      raw,
    });
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
  return { rows, page: num(body.page), totalPages: num(body.total_pages), total: num(body.total), issues };
}

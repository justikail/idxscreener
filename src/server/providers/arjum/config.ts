// Base URL dikunci sebagai konstanta — tidak pernah diambil dari input pengguna
// atau parameter request (AGENTS.md §7: "Kunci base URL penyedia").
export const ARJUM_BASE_URL = "https://stock.arjum.com";
export const ARJUM_PROVIDER = "arjum";

// @protected-start — JANGAN DIUBAH
/** Kuota resmi satu akun Arjum (free plan: 1.000/hari, gabungan semua key). */
export function arjumAccountQuota(): number {
  const raw = Number(process.env.ARJUM_ACCOUNT_QUOTA ?? "5000");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5000;
}

/**
 * Budget harian aplikasi untuk SEMUA request Arjum (OHLCV + dataset tambahan),
 * dari ARJUM_DAILY_BUDGET. Tidak pernah melebihi kuota satu akun
 * (ARJUM_ACCOUNT_QUOTA, bawaan 1.000) — nilai lebih besar dipotong, tidak
 * dinaikkan otomatis. Bawaan 990 bila variabel kosong/tidak valid.
 */
export function arjumDailyBudget(): number {
  const raw = Number(process.env.ARJUM_DAILY_BUDGET ?? "5000");
  const configured = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5000;
  return Math.min(configured, arjumAccountQuota());
}

/** true bila ARJUM_DAILY_BUDGET di environment melebihi kuota akun (ditampilkan sebagai peringatan admin). */
export function arjumBudgetClamped(): boolean {
  const raw = Number(process.env.ARJUM_DAILY_BUDGET ?? "5000");
  return Number.isFinite(raw) && raw > arjumAccountQuota();
}

/**
 * SATU key dari environment server (tidak pernah NEXT_PUBLIC_*): ARJUM_API_KEY,
 * atau — untuk konfigurasi lama — key PERTAMA dari ARJUM_API_KEYS. Tidak ada
 * rotasi antar-key: memakai banyak key untuk menyebar pemakaian termasuk
 * penggabungan kuota yang dilarang (AGENTS.md §3, §7).
 */
export function arjumApiKey(): string | null {
  const single = process.env.ARJUM_API_KEY?.trim();
  if (single) return single;
  const keys = (process.env.ARJUM_API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  if(keys.length === 0) return null;
  const picked = keys[Math.floor(Math.random() * keys.length)];
  return picked ?? null;
}

/** Jumlah key yang dikonfigurasi (untuk peringatan admin; nilainya tidak pernah ditampilkan). */
export function arjumConfiguredKeyCount(): number {
  const list = new Set((process.env.ARJUM_API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean));
  const single = process.env.ARJUM_API_KEY?.trim();
  if (single) list.add(single);
  return list.size;
}
// @protected-end

/** Kode saham IDX: huruf/angka kapital, 1–8 karakter. Dipakai sebelum disisipkan ke path. */
export function assertStockCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(normalized)) {
    throw new Error(`Kode saham tidak valid: "${code}"`);
  }
  return normalized;
}

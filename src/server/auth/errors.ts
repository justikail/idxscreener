// Dipisah dari session.ts SENGAJA: file ini TIDAK mengimpor next-auth (yang
// menarik "next/server" dan gagal diresolve di luar bundler Next.js, mis. di
// Vitest). core.ts tiap fitur (watchlist/notes/saved-screens/admin) hanya
// butuh kelas error ini + requireOwnership, bukan requireUser/requireAdmin
// yang bergantung sesi — sehingga core.ts tetap bisa diuji langsung tanpa
// mem-bundle next-auth. Lihat tests/integration/authorization.test.ts.

export class UnauthorizedError extends Error {
  constructor(message = "Anda harus masuk untuk melakukan aksi ini.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Anda tidak memiliki akses untuk aksi ini.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Menegakkan bahwa `resourceOwnerId` (owner_id yang dibaca dari DB, BUKAN dari
 * input klien) sama dengan pengguna yang sedang login. Dipakai sebelum setiap
 * update/delete resource privat (watchlist, notes, saved_screens, alerts).
 */
export function requireOwnership(currentUserId: string, resourceOwnerId: string): void {
  if (currentUserId !== resourceOwnerId) throw new ForbiddenError();
}

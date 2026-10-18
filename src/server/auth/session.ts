import "server-only";

import { auth } from "./config";
import { ForbiddenError, UnauthorizedError } from "./errors";

export { ForbiddenError, UnauthorizedError, requireOwnership } from "./errors";

export interface SessionUser {
  id: string;
  role: string;
  email: string;
  name: string;
}

/**
 * Dipakai di AWAL setiap server action/route yang butuh pengguna login.
 * Melempar UnauthorizedError (bukan mengembalikan null diam-diam) agar
 * caller tidak lupa menangani kasus belum login. Otorisasi kepemilikan
 * dicek di server, TIDAK pernah dipercayakan ke UI (AGENTS.md §11).
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return {
    id: session.user.id,
    role: session.user.role,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
  };
}

/** Dipakai untuk aksi admin (mis. retry job). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new ForbiddenError();
  return user;
}

import "@/server/load-env";

import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";

/**
 * Ganti password satu pengguna — wajib sebelum aplikasi dibuka untuk orang
 * lain, karena password akun demo tertulis di src/jobs/seed-users.ts.
 *
 *   pnpm users:set-password -- --email=admin@demo.local
 *     → password acak 20 karakter dibuat dan ditampilkan SEKALI
 *   NEW_PASSWORD='...' pnpm users:set-password -- --email=admin@demo.local
 *     → memakai password yang diberikan (min. 12 karakter)
 */
async function main() {
  const email = process.argv.slice(2).find((a) => a.startsWith("--email="))?.slice("--email=".length).trim().toLowerCase();
  if (!email) throw new Error("Wajib --email=<email pengguna>.");
  const given = process.env.NEW_PASSWORD;
  if (given !== undefined && given.length < 12) throw new Error("NEW_PASSWORD minimal 12 karakter.");
  const password = given ?? randomBytes(15).toString("base64url");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diset.");
  const client = postgres(url, { max: 1, prepare: false });
  try {
    const db = drizzle(client, { schema });
    const updated = await db
      .update(schema.users)
      .set({ passwordHash: await bcrypt.hash(password, 12) })
      .where(eq(schema.users.email, email))
      .returning({ email: schema.users.email, role: schema.users.role });
    if (updated.length === 0) throw new Error(`Pengguna ${email} tidak ditemukan.`);
    console.log(`Password ${updated[0]!.email} (${updated[0]!.role}) diganti.`);
    if (given === undefined) console.log(`Password baru (simpan sekarang, tidak ditampilkan lagi): ${password}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Gagal:", error instanceof Error ? error.message : error);
  process.exit(1);
});

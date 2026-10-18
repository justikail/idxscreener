import "@/server/load-env";

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";

/**
 * Pengguna DEMO tetap (email/password statis, HANYA untuk pengembangan lokal —
 * jangan pernah dipakai sebagai kredensial produksi). Dipakai oleh test
 * integrasi isolasi user A/B dan pembatasan admin
 * (tests/integration/authorization.test.ts), serta untuk mencoba fitur M2
 * secara manual di `pnpm dev` tanpa harus mendaftar dulu.
 */
export const DEMO_USERS = [
  { email: "admin@demo.local", password: "admin12345", name: "Admin Demo", role: "admin" as const },
  { email: "usera@demo.local", password: "usera12345", name: "Pengguna A Demo", role: "user" as const },
  { email: "userb@demo.local", password: "userb12345", name: "Pengguna B Demo", role: "user" as const },
];

export async function seedDemoUsers(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL belum diset. Salin .env.example menjadi .env.local.");
  }

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  try {
    for (const demoUser of DEMO_USERS) {
      const passwordHash = await bcrypt.hash(demoUser.password, 10);
      const [existing] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, demoUser.email))
        .limit(1);

      if (existing) {
        await db
          .update(schema.users)
          .set({ passwordHash, name: demoUser.name, role: demoUser.role })
          .where(eq(schema.users.id, existing.id));
      } else {
        await db.insert(schema.users).values({
          email: demoUser.email,
          passwordHash,
          name: demoUser.name,
          role: demoUser.role,
        });
      }
    }
  } finally {
    await client.end();
  }
}

async function main() {
  await seedDemoUsers();
  console.log(`${DEMO_USERS.length} pengguna demo disiapkan: ${DEMO_USERS.map((u) => u.email).join(", ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Seed pengguna demo gagal:", error);
    process.exit(1);
  });
}

import "@/server/load-env";

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL belum diset. Salin .env.example menjadi .env.local.");
  }

  const migrationClient = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(migrationClient);

  console.log("Menjalankan migrasi Drizzle...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrasi selesai.");

  await migrationClient.end();
}

main().catch((error) => {
  console.error("Migrasi gagal:", error);
  process.exit(1);
});

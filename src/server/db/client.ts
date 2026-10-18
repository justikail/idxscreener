import "server-only";
import "@/server/net-tuning";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL belum diset. Salin .env.example menjadi .env.local.");
}

// Neon memutus koneksi yang lama menganggur; tutup lebih dulu di sisi kita agar
// pool tidak memakai socket mati (ECONNRESET saat halaman dimuat).
const queryClient = postgres(connectionString, { max: 10, prepare: false, idle_timeout: 20, max_lifetime: 60 * 30 });

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;

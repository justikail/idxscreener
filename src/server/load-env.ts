import { config } from "dotenv";

import "./net-tuning";

// Dipakai oleh script CLI (seed, migrate, jobs) yang berjalan lewat tsx, di luar
// Next.js — Next.js sendiri sudah otomatis memuat .env.local. `.env.local`
// diprioritaskan, `.env` sebagai fallback opsional.
config({ path: ".env.local" });
config();

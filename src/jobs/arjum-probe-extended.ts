import "@/server/load-env";

import { writeFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { arjumGet, type ArjumResponse } from "@/server/providers/arjum/client";
import { ARJUM_PROVIDER, arjumApiKey, arjumDailyBudget } from "@/server/providers/arjum/config";
import { ArjumMissingKeyError } from "@/server/providers/arjum/errors";
import { describeShape } from "@/server/providers/arjum/schemas";
import { getQuotaUsage, recordProviderQuota, reserveQuota } from "@/server/quota/budget";

/**
 * Probe read-only untuk endpoint yang belum punya bukti struktur lengkap
 * (financial-statements neraca/arus kas/tahunan + emiten non-bank,
 * broker-summary parameter, broker-accumulation, insiders, seasonal, price,
 * health). Opt-in, TIDAK dijalankan test/CI.
 *
 *   pnpm arjum:probe-extended -- --max-calls=30 --out=/path/hasil.json
 *
 * Batas keras: --max-calls (maks 30) termasuk retry (maxAttempts 1 → tanpa
 * retry), dan reservasi kuota bersama di DB (budget aplikasi ≤ kuota akun).
 * Body lengkap disimpan ke provider_raw_snapshots (capability probe:*) dan
 * ke file --out; key tidak pernah ditulis.
 */
const STEPS: Array<{ id: string; path: string; params?: Record<string, string | number> }> = [
  { id: "health", path: "/api/health" },
  { id: "fin-BBCA-IS-q8", path: "/api/financial-statements/BBCA", params: { report_type: "INCOME_STATEMENT", period: "quarterly", limit: 8 } },
  { id: "fin-BBCA-IS-a3", path: "/api/financial-statements/BBCA", params: { report_type: "INCOME_STATEMENT", period: "annually", limit: 3 } },
  { id: "fin-BBCA-BS-q8", path: "/api/financial-statements/BBCA", params: { report_type: "BALANCE_SHEET", period: "quarterly", limit: 8 } },
  { id: "fin-BBCA-CF-q8", path: "/api/financial-statements/BBCA", params: { report_type: "CASH_FLOW_REPORT", period: "quarterly", limit: 8 } },
  { id: "fin-TLKM-IS-q8", path: "/api/financial-statements/TLKM", params: { report_type: "INCOME_STATEMENT", period: "quarterly", limit: 8 } },
  { id: "fin-TLKM-IS-a3", path: "/api/financial-statements/TLKM", params: { report_type: "INCOME_STATEMENT", period: "annually", limit: 3 } },
  { id: "fin-TLKM-BS-q8", path: "/api/financial-statements/TLKM", params: { report_type: "BALANCE_SHEET", period: "quarterly", limit: 8 } },
  { id: "fin-TLKM-CF-q8", path: "/api/financial-statements/TLKM", params: { report_type: "CASH_FLOW_REPORT", period: "quarterly", limit: 8 } },
  { id: "fin-BBCA-IS-q4-y2024", path: "/api/financial-statements/BBCA", params: { report_type: "INCOME_STATEMENT", period: "quarterly", limit: 4, year: 2024 } },
  { id: "broker-BBCA-default", path: "/api/broker-summary/BBCA" },
  { id: "broker-BBCA-limit200", path: "/api/broker-summary/BBCA", params: { broker_limit: 200 } },
  { id: "broker-BBCA-alldata", path: "/api/broker-summary/BBCA", params: { all_data: "true" } },
  { id: "broker-BBCA-range5", path: "/api/broker-summary/BBCA", params: { start_date: "2026-09-28", end_date: "2026-10-02" } },
  { id: "accum-BBCA-default", path: "/api/broker-accumulation/BBCA" },
  { id: "accum-BBCA-range-top5", path: "/api/broker-accumulation/BBCA", params: { start_date: "2026-09-01", end_date: "2026-10-02", top: 5 } },
  { id: "insiders-BBCA-p1", path: "/api/insiders/BBCA", params: { page: 1 } },
  { id: "insiders-BBCA-p2", path: "/api/insiders/BBCA", params: { page: 2 } },
  { id: "seasonal-BBCA", path: "/api/seasonal/BBCA" },
  { id: "price-BBCA", path: "/api/price/BBCA" },
];

function arg(name: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const maxCalls = Math.min(Number(arg("max-calls") ?? "30"), 30);
  const only = arg("only")?.split(",");
  const out = arg("out");
  const apiKey = arjumApiKey();
  if (!apiKey) throw new ArjumMissingKeyError();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL belum diset.");
  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  const dailyLimit = arjumDailyBudget();
  const batchId = `arjum-probe-ext-${Date.now()}`;
  let calls = 0;
  const before = await getQuotaUsage(db, ARJUM_PROVIDER);
  console.log(`Kuota aplikasi sebelum: ${before?.used ?? 0}/${dailyLimit}; header penyedia terakhir: ${before?.providerRemaining ?? "-"}`);
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const step of STEPS) {
      if (only && !only.includes(step.id)) continue;
      if (calls >= maxCalls) {
        console.log(`Batas ${maxCalls} panggilan tercapai — sisa langkah dilewati.`);
        break;
      }
      let res: ArjumResponse | null = null;
      let error: string | null = null;
      try {
        res = await arjumGet(
          {
            apiKey,
            maxAttempts: 1,
            reserve: async () => {
              calls += 1;
              await reserveQuota(db, ARJUM_PROVIDER, dailyLimit, 1);
            },
            onHeaders: (h) => recordProviderQuota(db, ARJUM_PROVIDER, h, dailyLimit),
          },
          step.path,
          step.params ?? {},
        );
      } catch (e) {
        error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        if (e instanceof Error && e.name === "QuotaExhaustedError") {
          console.log(error);
          break;
        }
      }
      results.push({ id: step.id, path: step.path, params: step.params ?? {}, httpStatus: res?.httpStatus ?? null, durationMs: res?.durationMs ?? null, headers: res?.responseHeaders ?? null, error, shape: res ? describeShape(res.body) : null, body: res?.body ?? null });
      if (res) {
        await db.insert(schema.providerRawSnapshots).values({
          provider: ARJUM_PROVIDER,
          capability: `probe:${step.id}`.slice(0, 64),
          requestParams: { path: step.path, ...(step.params ?? {}) },
          httpStatus: res.httpStatus,
          contentType: res.contentType,
          rowCount: null,
          rawBody: res.body as object,
          batchId,
        });
      }
      console.log(`${step.id}: ${res ? `HTTP ${res.httpStatus} ${res.durationMs}ms remaining=${res.responseHeaders["x-ratelimit-remaining"] ?? "-"}` : error}`);
    }
  } finally {
    const after = await getQuotaUsage(db, ARJUM_PROVIDER);
    console.log(`Panggilan: ${calls}; kuota aplikasi sesudah: ${after?.used ?? 0}/${dailyLimit}; header penyedia: ${after?.providerRemaining ?? "-"}/${after?.providerLimit ?? "-"}`);
    if (out) writeFileSync(out, JSON.stringify({ batchId, calls, results }, null, 1));
    await client.end();
  }
}

main().catch((error) => {
  console.error("Probe gagal:", error instanceof Error ? error.message : error);
  process.exit(1);
});

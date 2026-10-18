import "@/server/load-env";

import { and, eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { normalizeAccumulation, normalizeSeasonal } from "@/server/ingestion/arjum-derived";
import { normalizeInsiders } from "@/server/ingestion/arjum-insiders";
import { normalizeQuote } from "@/server/ingestion/arjum-price";
import { ingestFinancialsForCode, type FINANCIAL_REQUESTS } from "@/server/ingestion/financials-store";
import { storeBrokerSummary, storeDerived, storeInsiderRows } from "@/server/jobs/datasets";
import type { ArjumProvider } from "@/server/providers/arjum/adapter";
import { ARJUM_PROVIDER } from "@/server/providers/arjum/config";
import { arjumBrokerSummaryResponseSchema, arjumFinancialStatementsResponseSchema, arjumPriceResponseSchema } from "@/server/providers/arjum/schemas";
import { quotaDateWib } from "@/server/quota/budget";

/**
 * Putar ulang respons LIVE yang sudah tersimpan oleh `arjum:probe-extended`
 * (provider_raw_snapshots, capability probe:*) melalui normalizer & penyimpanan
 * yang sama dengan worker. 0 request ke penyedia; aman dijalankan berulang
 * (bukti idempotensi pada data real).
 *
 *   pnpm jobs:replay-probe -- --batch=arjum-probe-ext-...
 */
type Snap = { capability: string; requestParams: Record<string, unknown>; rawBody: unknown; fetchedAt: Date };

async function main() {
  const batch = process.argv.slice(2).find((a) => a.startsWith("--batch="))?.slice(8);
  if (!batch) throw new Error("Wajib --batch=<batch_id probe>.");
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const db = drizzle(client, { schema });
  try {
    const snaps = (await db
      .select({ capability: schema.providerRawSnapshots.capability, requestParams: schema.providerRawSnapshots.requestParams, rawBody: schema.providerRawSnapshots.rawBody, fetchedAt: schema.providerRawSnapshots.fetchedAt })
      .from(schema.providerRawSnapshots)
      .where(and(eq(schema.providerRawSnapshots.batchId, batch), like(schema.providerRawSnapshots.capability, "probe:%")))) as Snap[];
    if (snaps.length === 0) throw new Error(`Tidak ada snapshot untuk batch ${batch}.`);
    const instrumentId = async (code: string) => {
      const [row] = await db.select({ id: schema.instruments.id }).from(schema.instruments).where(and(eq(schema.instruments.code, code), eq(schema.instruments.dataMode, "live")));
      if (!row) throw new Error(`Instrumen live ${code} tidak ada.`);
      return row.id;
    };
    const step = (s: Snap) => s.capability.slice("probe:".length);

    // Laporan keuangan: provider palsu menjawab dari snapshot (kode, jenis, periode).
    for (const code of ["BBCA", "TLKM"]) {
      const fin = snaps.filter((s) => /^fin-/.test(step(s)) && String(s.requestParams.path).endsWith(`/${code}`) && s.requestParams.year === undefined);
      const provider = {
        async financialStatements(c: string, o: { reportType: string; period: string }) {
          const hit = fin.find((s) => s.requestParams.report_type === o.reportType && s.requestParams.period === o.period);
          if (!hit) throw new Error(`Snapshot ${c} ${o.reportType} ${o.period} tidak ada.`);
          return { data: arjumFinancialStatementsResponseSchema.parse(hit.rawBody), response: {} };
        },
      } as unknown as Pick<ArjumProvider, "financialStatements">;
      const requests = [
        { reportType: "INCOME_STATEMENT", period: "quarterly", limit: 8 },
        { reportType: "INCOME_STATEMENT", period: "annually", limit: 3 },
        { reportType: "BALANCE_SHEET", period: "quarterly", limit: 8 },
        { reportType: "CASH_FLOW_REPORT", period: "quarterly", limit: 8 },
      ] as unknown as typeof FINANCIAL_REQUESTS;
      const r = await ingestFinancialsForCode(db, provider, await instrumentId(code), code, batch, requests);
      console.log(`[laporan ${code}] laporan +${r.reportsInserted}/rev ${r.reportsRevised}; fakta +${r.factsInserted}/rev ${r.factsRevised}; basis ${r.basis.basis} ${JSON.stringify(r.basis.checks.map((c) => [c.year, c.result]))}; isu ${r.issues.length}`);
    }

    const bbca = await instrumentId("BBCA");
    for (const s of snaps.filter((x) => step(x).startsWith("broker-BBCA-"))) {
      const params = s.requestParams.all_data ? { allData: true } : s.requestParams.broker_limit ? { brokerLimit: Number(s.requestParams.broker_limit) } : {};
      console.log(`[broker ${step(s)}] ${await storeBrokerSummary(db, bbca, "BBCA", arjumBrokerSummaryResponseSchema.parse(s.rawBody), params, batch)}`);
    }
    for (const s of snaps.filter((x) => step(x).startsWith("accum-BBCA-"))) {
      const top = s.requestParams.top ? Number(s.requestParams.top) : null;
      const { payload, issues } = normalizeAccumulation(s.rawBody as Record<string, unknown>, "BBCA", top);
      if (!payload) throw new Error(issues.join("; "));
      await storeDerived(db, bbca, "broker_accumulation", top ? `top=${top}` : "default", payload.startDate, payload.endDate, payload, batch);
      console.log(`[akumulasi ${step(s)}] ${payload.series.length} broker ${payload.startDate}..${payload.endDate} konsisten=${payload.checks.cumulativeConsistent}`);
    }
    let insiderNew = 0;
    for (const s of snaps.filter((x) => step(x).startsWith("insiders-BBCA-"))) {
      insiderNew += await storeInsiderRows(db, bbca, normalizeInsiders(s.rawBody as Record<string, unknown>, "BBCA").rows);
    }
    console.log(`[insider] ${insiderNew} baris baru`);
    const seasonal = snaps.find((x) => step(x) === "seasonal-BBCA");
    if (seasonal) {
      const { payload } = normalizeSeasonal(seasonal.rawBody as Record<string, unknown>, "BBCA");
      if (payload) await storeDerived(db, bbca, "seasonal", "", null, null, payload, batch);
      console.log(`[seasonal] ${payload?.years.length ?? 0} tahun`);
    }
    const price = snaps.find((x) => step(x) === "price-BBCA");
    if (price) {
      const { quote } = normalizeQuote(arjumPriceResponseSchema.parse(price.rawBody), "BBCA", quotaDateWib(price.fetchedAt));
      if (quote) {
        const row = { provider: ARJUM_PROVIDER, lastPrice: quote.lastPrice?.toString() ?? null, freq: quote.freq, lot: quote.lot?.toString() ?? null, value: quote.value?.toString() ?? null, sourceDate: quote.sourceDate, dataTs: quote.dataTs, servedTs: quote.servedTs, marketState: quote.marketState, marketLabel: quote.marketLabel, noTradeToday: quote.noTradeToday, quoteAgeMs: quote.quoteAgeMs, isFallbackClose: quote.isFallbackClose, fetchedAt: price.fetchedAt };
        await db.insert(schema.latestQuotes).values({ instrumentId: bbca, ...row }).onConflictDoUpdate({ target: schema.latestQuotes.instrumentId, set: row });
        console.log(`[harga] ${quote.lastPrice} fallback=${quote.isFallbackClose} source_date=${quote.sourceDate}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Replay gagal:", error instanceof Error ? error.message : error);
  process.exit(1);
});

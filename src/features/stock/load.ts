import "server-only";

import { cache } from "react";

import type { ChartBar } from "@/components/market/StockChart";
import { getDailyBars, getInstrumentByCode, getLatestMetricSnapshots } from "@/server/db/queries";

/** Dipakai bersama layout & tab detail saham dalam satu permintaan (cache per request). */
export const loadInstrument = cache(async (code: string) => getInstrumentByCode(code));

export const loadBars = cache(async (instrumentId: string) => {
  const raw = await getDailyBars(instrumentId, 300);
  // Candlestick butuh OHLC lengkap; bar dengan nilai kosong tidak digambar (tidak dipalsukan).
  const bars: ChartBar[] = raw
    .filter((b) => b.open !== null && b.high !== null && b.low !== null && b.close !== null)
    .map((b) => ({ time: b.tradingDate, open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close), volume: b.volume !== null ? Number(b.volume) : null }));
  return { raw, bars };
});

export const loadSnapshots = cache(async (instrumentId: string) => getLatestMetricSnapshots(instrumentId));

export type Snap = { metric: string; value: string | null; status: string; unit: string | null };

export function snapHelpers(snapshots: Snap[]) {
  const snap = (m: string) => snapshots.find((s) => s.metric === m);
  const num = (m: string) => {
    const s = snap(m);
    return s && (s.status === "ok" || s.status === "stale") && s.value !== null ? Number(s.value) : null;
  };
  const metric = (m: string) => {
    const s = snap(m);
    return s ? { value: s.value === null ? null : Number(s.value), status: s.status } : undefined;
  };
  return { snap, num, metric };
}

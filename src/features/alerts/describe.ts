import { formatNumber } from "@/lib/format";

export type AlertMetricKey = "price" | "per" | "pbv" | "roe" | "rsi14" | "volume_relative_20d";

/** Satuan tampilan per metrik. ROE disimpan sebagai pecahan (0,15) tetapi diketik dalam persen (15). */
export const ALERT_METRICS: Record<AlertMetricKey, { label: string; unit: string; toStored: (v: number) => number; fromStored: (v: number) => number; digits: number }> = {
  price: { label: "Harga penutupan", unit: "Rp", toStored: (v) => v, fromStored: (v) => v, digits: 0 },
  rsi14: { label: "RSI 14", unit: "", toStored: (v) => v, fromStored: (v) => v, digits: 1 },
  per: { label: "PER", unit: "×", toStored: (v) => v, fromStored: (v) => v, digits: 2 },
  pbv: { label: "PBV", unit: "×", toStored: (v) => v, fromStored: (v) => v, digits: 2 },
  roe: { label: "ROE", unit: "%", toStored: (v) => v / 100, fromStored: (v) => v * 100, digits: 1 },
  volume_relative_20d: { label: "Volume relatif 20 sesi", unit: "×", toStored: (v) => v, fromStored: (v) => v, digits: 2 },
};

export type ExistingAlert = { id: number; metric: string; operator: string; threshold: string; isActive: boolean };

export function describeAlert(a: { metric: string; operator: string; threshold: string | number }): string {
  const m = ALERT_METRICS[a.metric as AlertMetricKey];
  const op = a.operator === "lte" || a.operator === "lt" ? "turun ke / di bawah" : "naik ke / di atas";
  if (!m) return `${a.metric} ${op} ${a.threshold}`;
  const v = m.fromStored(Number(a.threshold));
  const shown = m.unit === "Rp" ? `Rp${formatNumber(v)}` : `${formatNumber(v, m.digits)}${m.unit}`;
  return `${m.label} ${op} ${shown}`;
}


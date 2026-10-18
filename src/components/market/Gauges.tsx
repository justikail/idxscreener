import { formatNumber } from "@/lib/format";

/** RSI 0–100 dengan zona konvensional 30/70. Zona hanya konteks, bukan sinyal beli/jual. */
export function RsiScale({ value }: { value: number | null }) {
  if (value === null) return <p className="text-sm text-ink-500">Riwayat belum cukup (butuh ≥ 15 sesi).</p>;
  const pos = Math.min(Math.max(value, 0), 100);
  const zone = value >= 70 ? "Jenuh beli" : value <= 30 ? "Jenuh jual" : "Netral";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="num text-3xl font-semibold">{formatNumber(value, 1)}</span>
        <span className="kicker">{zone}</span>
      </div>
      <div className="relative mt-3 h-2.5 rounded-full bg-[linear-gradient(90deg,#d4ebdd_0%,#d4ebdd_30%,#e2d9c8_30%,#e2d9c8_70%,#f8dbd4_70%,#f8dbd4_100%)]">
        <span
          className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-ink-900 ring-2 ring-paper"
          style={{ left: `${pos}%` }}
          aria-hidden
        />
      </div>
      <div className="num mt-1.5 flex justify-between text-[10px] text-ink-400">
        <span>0</span>
        <span style={{ marginLeft: "22%" }}>30</span>
        <span style={{ marginRight: "22%" }}>70</span>
        <span>100</span>
      </div>
    </div>
  );
}

/** Posisi harga dalam rentang terendah–tertinggi periode (mis. 52 minggu). */
export function RangeBar({ low, high, current, label }: { low: number; high: number; current: number; label: React.ReactNode }) {
  const span = high - low || 1;
  const pos = Math.min(Math.max(((current - low) / span) * 100, 0), 100);
  return (
    <div>
      <p className="kicker">{label}</p>
      <div className="relative mt-4 h-1 rounded-full bg-ink-200">
        <span className="absolute inset-y-0 left-0 rounded-full bg-ink-900" style={{ width: `${pos}%` }} aria-hidden />
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-900 bg-kunyit-400"
          style={{ left: `${pos}%` }}
          aria-hidden
        />
      </div>
      <div className="num mt-2 flex justify-between text-xs">
        <span>
          <span className="text-ink-400">Terendah </span>
          {formatNumber(low)}
        </span>
        <span className="text-ink-500">{formatNumber(pos, 0)}% dari rentang</span>
        <span>
          <span className="text-ink-400">Tertinggi </span>
          {formatNumber(high)}
        </span>
      </div>
    </div>
  );
}

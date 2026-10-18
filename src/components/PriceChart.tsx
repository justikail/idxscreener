"use client";

interface Bar {
  tradingDate: string;
  close: number;
}

export function PriceChart({ bars }: { bars: Bar[] }) {
  if (bars.length < 2) {
    return <p className="text-sm text-slate-500">Data harga tidak cukup untuk menampilkan grafik.</p>;
  }

  const width = 720;
  const height = 220;
  const padding = 24;

  const closes = bars.map((b) => b.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const points = bars.map((bar, i) => {
    const x = padding + (i / (bars.length - 1)) * (width - padding * 2);
    const y = height - padding - ((bar.close - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const firstClose = bars[0]!.close;
  const lastClose = bars[bars.length - 1]!.close;
  const isUp = lastClose >= firstClose;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Grafik harga penutupan dari ${bars[0]!.tradingDate} sampai ${bars[bars.length - 1]!.tradingDate}`}
        className="w-full h-auto"
      >
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={isUp ? "#059669" : "#dc2626"}
          strokeWidth={2}
        />
      </svg>
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{bars[0]!.tradingDate}</span>
        <span>{bars[bars.length - 1]!.tradingDate}</span>
      </div>
    </div>
  );
}

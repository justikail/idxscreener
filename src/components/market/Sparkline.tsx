interface SparklineProps {
  values: number[];
  id: string;
  width?: number;
  height?: number;
  className?: string;
}

/** Garis harga mini 30 sesi. Warna mengikuti arah awal→akhir periode. */
export function Sparkline({ values, id, width = 96, height = 28, className }: SparklineProps) {
  if (values.length < 2) {
    return <span className="kicker">—</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const rising = values[values.length - 1]! >= values[0]!;
  const stroke = rising ? "#0f6b43" : "#c8402a";
  const gid = `spark-${id}`;
  const last = pts[pts.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={`Tren ${values.length} sesi: ${rising ? "naik" : "turun"}`}
    >
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={stroke} />
    </svg>
  );
}

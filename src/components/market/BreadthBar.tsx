/** Breadth pasar sebagai satu garis proporsional: naik | tetap | turun. */
export function BreadthBar({ up, flat, down }: { up: number; flat: number; down: number }) {
  const total = Math.max(up + flat + down, 1);
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <figure className="w-full">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-200" role="img" aria-label={`${up} naik, ${flat} tetap, ${down} turun`}>
        <div className="h-full bg-up-600 transition-[width] duration-700" style={{ width: pct(up) }} />
        <div className="h-full bg-ink-300" style={{ width: pct(flat) }} />
        <div className="h-full bg-down-500" style={{ width: pct(down) }} />
      </div>
      <figcaption className="mt-3 grid grid-cols-3 text-sm">
        <span>
          <span className="num text-3xl font-semibold text-up-600">{up}</span>
          <span className="ml-2 kicker">▲ Menguat</span>
        </span>
        <span className="text-center">
          <span className="num text-3xl font-semibold text-ink-600">{flat}</span>
          <span className="ml-2 kicker">■ Tetap</span>
        </span>
        <span className="text-right">
          <span className="kicker mr-2">Melemah ▼</span>
          <span className="num text-3xl font-semibold text-down-500">{down}</span>
        </span>
      </figcaption>
    </figure>
  );
}

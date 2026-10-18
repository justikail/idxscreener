export type TugRow = { code: string; name: string | null; value: number; sub?: string };

/**
 * "Tarik tambang": net jual di kiri, net beli di kanan, SATU skala bersama
 * sehingga panjang batang kiri dan kanan bisa dibandingkan langsung.
 * Kode broker di lajur tengah, angka di ujung luar batang (selalu di atas
 * latar kertas, jadi kontrasnya terjaga berapa pun panjang batangnya).
 */
export function TugOfWar({
  buyers,
  sellers,
  format,
  buyLabel = "Net beli",
  sellLabel = "Net jual",
}: {
  buyers: TugRow[];
  sellers: TugRow[];
  format: (v: number) => string;
  buyLabel?: string;
  sellLabel?: string;
}) {
  const max = Math.max(1, ...buyers.map((r) => Math.abs(r.value)), ...sellers.map((r) => Math.abs(r.value)));
  const rows = Math.max(buyers.length, sellers.length);

  return (
    <div>
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] gap-2 text-sm font-semibold">
        <p className="flex items-center gap-2 text-down-700">
          <span aria-hidden>◀</span> {sellLabel}
        </p>
        <span />
        <p className="flex items-center justify-end gap-2 text-up-700">
          {buyLabel} <span aria-hidden>▶</span>
        </p>
      </div>
      <ol className="flex flex-col gap-1">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-0">
            <Bar row={sellers[i]} max={max} format={format} side="sell" />
            <span className="grid w-[5.5rem] grid-cols-2 border-x sm:w-[6.5rem] border-ink-500 text-center">
              <span className="num py-1.5 text-sm font-bold text-down-700" title={sellers[i]?.name ?? undefined}>
                {sellers[i]?.code ?? ""}
              </span>
              <span className="num border-l border-ink-200 py-1.5 text-sm font-bold text-up-700" title={buyers[i]?.name ?? undefined}>
                {buyers[i]?.code ?? ""}
              </span>
            </span>
            <Bar row={buyers[i]} max={max} format={format} side="buy" />
          </li>
        ))}
      </ol>
      <p className="mt-2 text-center text-xs text-ink-500">Kode kiri = penjual bersih · kode kanan = pembeli bersih · panjang batang memakai skala yang sama</p>
    </div>
  );
}

function Bar({ row, max, format, side }: { row: TugRow | undefined; max: number; format: (v: number) => string; side: "buy" | "sell" }) {
  if (!row) return <span />;
  const pct = Math.max(1.5, (Math.abs(row.value) / max) * 100);
  const sell = side === "sell";
  return (
    <div className={`relative flex h-8 min-w-0 items-center gap-1.5 ${sell ? "flex-row-reverse" : ""}`} title={`${row.code}${row.name ? ` · ${row.name}` : ""}: ${format(row.value)}${row.sub ? ` · ${row.sub}` : ""}`}>
      <span aria-hidden className={`h-6 shrink-0 ${sell ? "rounded-l-[4px] bg-down-500" : "rounded-r-[4px] bg-up-500"}`} style={{ width: `calc((100% - 4.5rem) * ${(pct / 100).toFixed(4)})` }} />
      <span className="num shrink-0 whitespace-nowrap text-[11px] text-ink-800 sm:text-xs">{format(Math.abs(row.value))}</span>
      <span className="sr-only">
        {sell ? "net jual" : "net beli"} {row.code} {row.name ?? ""}
      </span>
    </div>
  );
}

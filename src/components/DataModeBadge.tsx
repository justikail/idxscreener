export function DataModeBadge({ mode }: { mode: "demo" | "live" }) {
  if (mode === "live") {
    return (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm bg-ink-900 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-paper"
        title="Data pasar dari Pihak Ketiga yang sudah lolos pemeriksaan — harga penutupan, bukan realtime"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-kunyit-400" aria-hidden />
        DATA REAL
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-dashed border-kunyit-600 bg-kunyit-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-kunyit-800"
      title="Data sintetis, bukan data pasar riil"
    >
      DATA DEMO
    </span>
  );
}

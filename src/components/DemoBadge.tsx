export function DemoBadge() {
  return (
    <div
      role="status"
      className="w-full bg-amber-100 border-b border-amber-300 text-amber-900 text-sm px-4 py-2 text-center"
    >
      <span className="font-semibold">DATA DEMO</span> — aplikasi ini memuat data sintetis untuk pengembangan.
      Setiap saham diberi label <span className="font-semibold">DATA DEMO</span> atau{" "}
      <span className="font-semibold">DATA REAL</span>; data real bukan data realtime.
    </div>
  );
}

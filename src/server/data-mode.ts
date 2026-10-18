export type DataMode = "demo" | "live";

/**
 * Mode data yang DITAMPILKAN di web, dari env DATA_MODE:
 * - "live": hanya data real (data demo tetap ada di DB, hanya disembunyikan)
 * - "demo": hanya data demo
 * - lainnya/kosong: keduanya, masing-masing berlabel
 */
export function visibleDataModes(): DataMode[] {
  const mode = process.env.DATA_MODE?.trim().toLowerCase();
  if (mode === "live") return ["live"];
  if (mode === "demo") return ["demo"];
  return ["demo", "live"];
}

export function isDataModeVisible(mode: DataMode): boolean {
  return visibleDataModes().includes(mode);
}

import type { FilterNode } from "./filter-ast";

export interface ScreeningPreset {
  code: string;
  name: string;
  description: string;
  filter: FilterNode;
}

// Preset awal M1. Ambang bersifat contoh/edukatif, bukan rekomendasi transaksi
// (lihat AGENTS.md §8 dan §10). "value_wajar" memakai der hanya sebagai konteks,
// bukan pembanding lintas bank/nonbank — lihat docs/methodology.md.
export const SCREENING_PRESETS: ScreeningPreset[] = [
  {
    code: "value_wajar",
    name: "Valuasi Wajar dengan Profitabilitas Sehat",
    description:
      "PER paling tinggi 15x dan ROE minimal 10%. " +
      "Ambang dipilih sebagai contoh awal, bukan rekomendasi beli.",
    filter: {
      type: "group",
      operator: "and",
      children: [
        { type: "condition", field: "per", operator: "lte", value: 15 },
        { type: "condition", field: "roe", operator: "gte", value: 0.1 },
      ],
    },
  },
  {
    code: "momentum_naik",
    name: "Momentum Teknikal Menguat",
    description:
      "RSI 14 minimal 55 dan volume relatif 20 sesi minimal 1,2x rata-rata. " +
      "Skor momentum bukan probabilitas keberhasilan.",
    filter: {
      type: "group",
      operator: "and",
      children: [
        { type: "condition", field: "rsi14", operator: "gte", value: 55 },
        { type: "condition", field: "volume_relative_20d", operator: "gte", value: 1.2 },
      ],
    },
  },
  {
    code: "asing_net_beli",
    name: "Net Beli Asing 5 Sesi",
    description:
      "Volume beli asing bersih minimal 5% dari volume 5 sesi terakhir, kapitalisasi minimal Rp1 triliun. " +
      "Aktivitas asing adalah catatan transaksi, bukan sinyal beli.",
    filter: {
      type: "group",
      operator: "and",
      children: [
        { type: "condition", field: "foreign_net_ratio_5d", operator: "gte", value: 0.05 },
        { type: "condition", field: "market_cap", operator: "gte", value: 1_000_000_000_000 },
      ],
    },
  },
];

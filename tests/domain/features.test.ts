import { describe, expect, it } from "vitest";

import { DATASET_FEATURE, datasetEnabledByFeature, FEATURES } from "@/lib/features";

describe("saklar fitur (fokus 3 menu client)", () => {
  it("dataset milik fitur nonaktif tidak diambil worker; dataset 3 menu utama tetap diambil", () => {
    for (const [dataset, feature] of Object.entries(DATASET_FEATURE)) {
      expect(datasetEnabledByFeature(dataset)).toBe(FEATURES[feature!]);
    }
    // Dipakai Kondisi Market / Detail Saham / Rekomendasi:
    for (const d of ["financials", "broker_summary", "broker_accumulation", "health"]) expect(datasetEnabledByFeature(d)).toBe(true);
  });

  it("fitur di luar permintaan client nonaktif (tidak dihapus)", () => {
    expect(FEATURES).toMatchObject({ pengumuman: false, watchlist: false, notifikasi: false, pengingat: false, catatan: false, permintaanData: false, screenerKustom: false });
  });
});

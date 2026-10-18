import { describe, expect, it } from "vitest";

import { pageHref, pageWindow, paginate } from "@/lib/pagination";

const items = Array.from({ length: 57 }, (_, i) => i + 1);

describe("paginate", () => {
  it("memotong sesuai halaman dan ukuran dari URL", () => {
    const s = paginate(items, { hal: "2", hal_per: "25" }, "hal", 10);
    expect(s).toMatchObject({ page: 2, pages: 3, size: 25, total: 57, from: 26, to: 50 });
    expect(s.items[0]).toBe(26);
  });

  it("ukuran di luar pilihan dan halaman tidak valid jatuh ke default / dijepit", () => {
    expect(paginate(items, { hal_per: "7", hal: "abc" }, "hal", 10)).toMatchObject({ size: 10, page: 1 });
    expect(paginate(items, { hal: "99" }, "hal", 10)).toMatchObject({ page: 6, from: 51, to: 57 });
    expect(paginate(items, { hal: "-3" }, "hal", 10).page).toBe(1);
  });

  it("daftar kosong tetap satu halaman tanpa baris", () => {
    expect(paginate([], {}, "hal", 10)).toMatchObject({ page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });
});

describe("pageHref", () => {
  it("mempertahankan parameter lain dan tidak menulis nilai default", () => {
    const params = { q: "bank", hal: "3", lolos: "2" };
    expect(pageHref("/saham", params, "hal", { page: 1, size: 25 }, 25)).toBe("/saham?q=bank&lolos=2");
    expect(pageHref("/saham", params, "hal", { page: 4, size: 50 }, 25, "tabel")).toBe("/saham?q=bank&lolos=2&hal=4&hal_per=50#tabel");
  });
});

describe("pageWindow", () => {
  it("menampilkan awal, akhir, sekitar halaman aktif, dan celah", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    // Celah satu nomor diisi nomornya, bukan "…".
    expect(pageWindow(3, 10)).toEqual([1, 2, 3, 4, null, 10]);
  });
});

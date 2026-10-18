import { describe, expect, it } from "vitest";

import {
  AuditBudget,
  AuditBudgetExhaustedError,
  checkPagination,
  dedupeCodes,
  extractFacts,
  newCheckpoint,
  nextStep,
  pagesFor,
  quotaCost,
  scheduleMarketCapPages,
  summarizeInstruments,
} from "@/server/audit/arjum-capacity";
import { weekdaysBetween } from "@/jobs/arjum-capacity-report";

describe("budget keras", () => {
  it("menolak percobaan ke-(limit+1) dan melanjutkan hitungan dari checkpoint", () => {
    const b = new AuditBudget(3);
    b.consume();
    b.consume();
    b.consume();
    expect(() => b.consume()).toThrow(AuditBudgetExhaustedError);
    expect(b.used).toBe(3);

    const resumed = new AuditBudget(5, 3); // 3 sudah terpakai pada sesi sebelumnya
    resumed.consume();
    resumed.consume();
    expect(() => resumed.consume()).toThrow(AuditBudgetExhaustedError);
  });

  it("budget 0 = tidak ada satu pun panggilan", () => {
    expect(() => new AuditBudget(0).consume()).toThrow(AuditBudgetExhaustedError);
  });
});

describe("checkpoint & resume", () => {
  it("langkah yang sudah selesai dilewati; halaman market-cap dijadwalkan sekali tepat setelah p1", () => {
    const cp = newCheckpoint("2026-10-02", "key#1");
    expect(nextStep(cp)!.id).toBe("health");
    cp.done.health = { facts: {}, manifestIndex: 0 };
    expect(nextStep(cp)!.id).toBe("market-cap:p1");
    cp.done["market-cap:p1"] = { facts: { total: 120, per_page: 50, total_pages: 3 }, manifestIndex: 1 };
    scheduleMarketCapPages(cp, 3);
    scheduleMarketCapPages(cp, 3); // resume memanggil ulang: tidak boleh duplikat
    expect(cp.pending.filter((s) => s.id.startsWith("market-cap:p")).map((s) => s.id)).toEqual(["market-cap:p1", "market-cap:p2", "market-cap:p3"]);
    expect(nextStep(cp)!.id).toBe("market-cap:p2");
  });

  it("checkpoint selamat diserialisasi lalu dilanjutkan", () => {
    const cp = newCheckpoint("2026-10-02", "key#1");
    cp.done.health = { facts: {}, manifestIndex: 0 };
    const restored = JSON.parse(JSON.stringify(cp));
    expect(nextStep(restored)!.id).toBe("market-cap:p1");
  });
});

describe("instrumen: dedupe & pagination", () => {
  it("dedupe menormalkan huruf/spasi dan melaporkan duplikat", () => {
    expect(dedupeCodes(["BBCA", "bbca ", "TLKM", "", "BBRI", "TLKM"])).toEqual({ unique: ["BBCA", "BBRI", "TLKM"], duplicates: ["BBCA", "TLKM"] });
  });

  it("jumlah halaman dan konsistensi metadata", () => {
    expect(pagesFor(963, 50)).toBe(20);
    expect(pagesFor(0, 50)).toBe(0);
    expect(pagesFor(50, 50)).toBe(1);
    expect(checkPagination({ total: 963, perPage: 50, totalPages: 20 }, 963, 20)).toEqual({
      expectedPages: 20,
      totalPagesMatches: true,
      allPagesSeen: true,
      rowsMatchTotal: true,
    });
    expect(checkPagination({ total: 963, perPage: 50, totalPages: 19 }, 950, 19).totalPagesMatches).toBe(false);
  });

  it("rangkuman dari beberapa halaman termasuk duplikat lintas halaman", () => {
    const cp = newCheckpoint("2026-10-02", "key#1");
    cp.done["market-cap:p1"] = { facts: { total: 4, per_page: 2, total_pages: 2, date: "2026-10-02" }, manifestIndex: 1 };
    cp.marketCapCodes = { "market-cap:p1": ["AAAA", "BBBB"], "market-cap:p2": ["BBBB", "CCCC"], "market-cap:date-2025-01-02": ["ZZZZ"] };
    const s = summarizeInstruments(cp);
    expect(s.unique).toBe(3);
    expect(s.rows).toBe(4);
    expect(s.duplicates).toEqual(["BBBB"]);
    expect(s.pagination!.rowsMatchTotal).toBe(true);
    expect(s.codes).not.toContain("ZZZZ"); // daftar tanggal lampau tidak dicampur ke daftar terkini
  });
});

describe("fakta tanpa data mentah", () => {
  it("menyalin metadata, menghitung baris & rentang tanggal, tidak menyalin angka harga", () => {
    const f = extractFacts({
      stock_code: "BBCA",
      frame: "daily",
      data_available: { from: "2020-01-02", to: "2026-10-02" },
      rows: [
        { date: "2026-10-01", close: 6000 },
        { date: "2026-10-02", close: 6100 },
      ],
    });
    expect(f).toMatchObject({ stock_code: "BBCA", frame: "daily", rowCount: 2, first: "2026-10-01", last: "2026-10-02", rowKeys: ["close", "date"] });
    expect(JSON.stringify(f)).not.toContain("6100");
  });

  it("biaya kuota hanya bila kedua header ada", () => {
    expect(quotaCost(990, 989)).toBe(1);
    expect(quotaCost(null, 989)).toBeNull();
  });
});

describe("hari kerja (batas atas jumlah sesi)", () => {
  it("menghitung Senin–Jumat inklusif", () => {
    expect(weekdaysBetween("2026-10-02", "2026-10-05")).toBe(2); // Jumat + Senin
    expect(weekdaysBetween("2026-10-03", "2026-10-04")).toBe(0); // akhir pekan
    expect(weekdaysBetween("2020-01-02", "2026-10-02")).toBe(1762);
  });
});

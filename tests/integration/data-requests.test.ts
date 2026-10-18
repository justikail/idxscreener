import "@/server/load-env";

import { and, eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { addCodeToScheduleCore } from "@/features/admin/core";
import { ForbiddenError } from "@/server/auth/errors";
import * as schema from "@/server/db/schema";
import type { DatasetHandler } from "@/server/jobs/datasets";
import type { ArjumProvider } from "@/server/providers/arjum/adapter";
import { ArjumAuthError } from "@/server/providers/arjum/errors";
import { reserveQuota } from "@/server/quota/budget";
import {
  activeQueue,
  adminUpdateRequest,
  chargedToday,
  enqueueFollows,
  leaveRequest,
  processRequestQueue,
  requestData,
  saveRequestSettings,
  setFollow,
  type UserDataset,
} from "@/server/requests/core";

// Tanggal lampau (Sabtu) → kuota hari ini milik worker sungguhan tidak tersentuh.
const NOW = new Date("2026-08-15T19:00:00+07:00");
const CODES = ["ZREQA", "ZREQB", "ZREQC"];
const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("permintaan data pengguna: antrean bersama, jatah, prioritas, notifikasi", () => {
  const client = postgres(connectionString!, { max: 4, prepare: false });
  const db = drizzle(client, { schema });
  const users: string[] = [];
  const instrumentIds: string[] = [];
  const provider = {} as ArjumProvider;

  /** Handler palsu: memesan `cost` kuota seperti provider asli, mencatat urutan pemanggilan. */
  const makeHandlers = (calls: string[], behavior: (dataset: string, code: string) => "ok" | "fail" | "auth" = () => "ok") => {
    const h = (dataset: UserDataset, cost: number): DatasetHandler => async ({ code }) => {
      const b = behavior(dataset, code);
      calls.push(`${dataset}:${code}`);
      if (b === "auth") throw new ArjumAuthError(401, "key invalid");
      await reserveQuota(db, "arjum", 5000, cost, NOW);
      if (b === "fail") throw new Error("respons tidak valid");
      return "ok";
    };
    return { financials: h("financials", 4), broker_summary: h("broker_summary", 1), insiders: h("insiders", 3), broker_accumulation: h("broker_accumulation", 1) };
  };

  const cleanupRows = async () => {
    await db.delete(schema.dataRequests).where(inArray(schema.dataRequests.code, CODES)); // subscribers ikut terhapus (cascade)
    await db.delete(schema.notifications).where(like(schema.notifications.idempotencyKey, "req:%"));
    await db.delete(schema.datasetFetchState).where(inArray(schema.datasetFetchState.code, CODES));
    await db.delete(schema.userStockFollows).where(inArray(schema.userStockFollows.userId, users.length ? users : ["00000000-0000-0000-0000-000000000000"]));
    await db.delete(schema.appSettings).where(inArray(schema.appSettings.key, ["user_requests", "user_requests_usage"]));
    await db.delete(schema.providerQuotaUsage).where(eq(schema.providerQuotaUsage.quotaDate, "2026-08-15"));
  };

  beforeAll(async () => {
    for (const code of CODES) {
      const [row] = await db
        .insert(schema.instruments)
        .values({ code, name: `Uji ${code}`, board: "utama", dataMode: "live" })
        .onConflictDoUpdate({ target: schema.instruments.code, set: { dataMode: "live" } })
        .returning({ id: schema.instruments.id });
      instrumentIds.push(row!.id);
    }
    for (let i = 0; i < 6; i++) {
      const [u] = await db
        .insert(schema.users)
        .values({ email: `req-uji-${i}@test.local`, name: `Uji ${i}`, passwordHash: "x", role: "user" })
        .onConflictDoUpdate({ target: schema.users.email, set: { name: `Uji ${i}` } })
        .returning({ id: schema.users.id });
      users.push(u!.id);
    }
  });

  beforeEach(async () => {
    await cleanupRows();
    await saveRequestSettings(db, { enabled: true, dailyBudget: 30, perUserDaily: 6, maxFollows: 2 });
  });

  afterAll(async () => {
    await cleanupRows();
    await db.delete(schema.users).where(inArray(schema.users.id, users));
    await db.delete(schema.instruments).where(inArray(schema.instruments.id, instrumentIds));
    await client.end();
  });

  it("data segar tidak diantrekan; permintaan baru memakai jatah; peminta kedua ikut antre gratis", async () => {
    await db.insert(schema.datasetFetchState).values({ dataset: "insiders", code: "ZREQA", lastSuccessAt: new Date(NOW.getTime() - 3_600_000), lastAttemptAt: NOW });
    const a = await requestData(db, { userId: users[0]!, code: "zreqa", datasets: ["insiders", "financials", "seasonal"], now: NOW });
    expect(a.results).toEqual([
      { dataset: "insiders", outcome: "fresh" },
      { dataset: "financials", outcome: "queued" },
    ]); // "seasonal" bukan dataset pengguna → diabaikan
    expect(a.remaining).toBe(5);

    const b = await requestData(db, { userId: users[1]!, code: "ZREQA", datasets: ["financials"], now: NOW });
    expect(b.results).toEqual([{ dataset: "financials", outcome: "joined" }]);
    expect(await chargedToday(db, users[1]!, NOW)).toBe(0);

    const again = await requestData(db, { userId: users[0]!, code: "ZREQA", datasets: ["financials"], now: NOW });
    expect(again.results[0]!.outcome).toBe("already");

    const q = await activeQueue(db, NOW);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ code: "ZREQA", dataset: "financials", requesters: 2, position: 1, etaDay: 0 });
  });

  it("5 pengguna meminta bersamaan → tepat 1 antrean, 5 peminta, 1 jatah terpakai", async () => {
    await Promise.all(users.slice(0, 5).map((u) => requestData(db, { userId: u, code: "ZREQB", datasets: ["broker_summary"], now: NOW })));
    const rows = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.code, "ZREQB"));
    expect(rows).toHaveLength(1);
    const subs = await db.select().from(schema.dataRequestSubscribers).where(eq(schema.dataRequestSubscribers.requestId, rows[0]!.id));
    expect(subs).toHaveLength(5);
    expect(subs.filter((s) => s.charged)).toHaveLength(1);
  });

  it("jatah harian ditegakkan; membatalkan permintaan yang belum diproses mengembalikan jatah", async () => {
    await saveRequestSettings(db, { perUserDaily: 1 });
    const r = await requestData(db, { userId: users[2]!, code: "ZREQC", datasets: ["financials", "broker_summary"], now: NOW });
    expect(r.results.map((x) => x.outcome)).toEqual(["queued", "limit"]);
    const [req] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.code, "ZREQC"));
    await leaveRequest(db, users[2]!, req!.id);
    const [after] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.id, req!.id));
    expect(after!.status).toBe("cancelled");
    expect(await chargedToday(db, users[2]!, NOW)).toBe(0);
    const again = await requestData(db, { userId: users[2]!, code: "ZREQC", datasets: ["broker_summary"], now: NOW });
    expect(again.results[0]!.outcome).toBe("queued");
    await expect(leaveRequest(db, users[3]!, req!.id)).rejects.toThrow(/tidak mengikuti/);
  });

  it("worker: urutan prioritas → peminta terbanyak; anggaran membatasi; notifikasi hanya ke peminta; jadi segar", async () => {
    await requestData(db, { userId: users[0]!, code: "ZREQA", datasets: ["broker_summary"], now: NOW });
    await requestData(db, { userId: users[0]!, code: "ZREQB", datasets: ["broker_summary"], now: NOW });
    await requestData(db, { userId: users[1]!, code: "ZREQB", datasets: ["broker_summary"], now: NOW });
    await requestData(db, { userId: users[0]!, code: "ZREQC", datasets: ["financials"], now: NOW });
    const [c] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.code, "ZREQC"));
    await adminUpdateRequest(db, c!.id, "prioritize");
    await saveRequestSettings(db, { dailyBudget: 5 }); // cukup untuk laporan (4) + 1 broker

    const notDone = await processRequestQueue(db, provider, makeHandlers([]), { dailyDone: false, log: () => {}, now: NOW });
    expect(notDone.stopped).toMatch(/Menunggu pembaruan harga/);

    const calls: string[] = [];
    const s = await processRequestQueue(db, provider, makeHandlers(calls), { dailyDone: true, log: () => {}, now: NOW });
    expect(calls).toEqual(["financials:ZREQC", "broker_summary:ZREQB"]); // prioritas admin, lalu 2 peminta
    expect(s).toMatchObject({ done: 2, requests: 5 });
    expect(s.stopped).toMatch(/Anggaran harian antrean/);

    const notes = await db.select().from(schema.notifications).where(like(schema.notifications.idempotencyKey, "req:%"));
    expect(notes.map((n) => n.title).sort()).toEqual(["Data ZREQB siap: Ringkasan broker", "Data ZREQB siap: Ringkasan broker", "Data ZREQC siap: Laporan keuangan"]);

    const fresh = await requestData(db, { userId: users[3]!, code: "ZREQB", datasets: ["broker_summary"], now: NOW });
    expect(fresh.results[0]!.outcome).toBe("fresh");

    // Hari berikutnya: anggaran baru, sisa antrean (ZREQA) dikerjakan; worker diulang tidak mengulang yang selesai.
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    const calls2: string[] = [];
    await processRequestQueue(db, provider, makeHandlers(calls2), { dailyDone: true, log: () => {}, now: tomorrow });
    await processRequestQueue(db, provider, makeHandlers(calls2), { dailyDone: true, log: () => {}, now: tomorrow });
    expect(calls2).toEqual(["broker_summary:ZREQA"]);
    await db.delete(schema.providerQuotaUsage).where(eq(schema.providerQuotaUsage.quotaDate, "2026-08-16"));
  });

  it("data yang sudah diambil jadwal lain selesai tanpa request", async () => {
    await requestData(db, { userId: users[0]!, code: "ZREQA", datasets: ["insiders"], now: NOW });
    await db.insert(schema.datasetFetchState).values({ dataset: "insiders", code: "ZREQA", lastSuccessAt: NOW, lastAttemptAt: NOW });
    const calls: string[] = [];
    const s = await processRequestQueue(db, provider, makeHandlers(calls), { dailyDone: true, log: () => {}, now: NOW });
    expect(calls).toEqual([]);
    expect(s).toMatchObject({ alreadyFresh: 1, requests: 0 });
  });

  it("gagal → dicoba lagi 1 jam kemudian, gagal 3× → ditandai gagal + diberi tahu; error kunci API menghentikan tanpa menghukum", async () => {
    await requestData(db, { userId: users[0]!, code: "ZREQA", datasets: ["broker_summary"], now: NOW });
    const failing = makeHandlers([], () => "fail");
    let t = NOW;
    for (let i = 0; i < 3; i++) {
      await processRequestQueue(db, provider, failing, { dailyDone: true, log: () => {}, now: t });
      t = new Date(t.getTime() + 61 * 60_000);
    }
    const [r] = await db.select().from(schema.dataRequests).where(eq(schema.dataRequests.code, "ZREQA"));
    expect(r).toMatchObject({ status: "failed", attempts: 3 });
    const [note] = await db.select().from(schema.notifications).where(eq(schema.notifications.idempotencyKey, `req:${r!.id}:${users[0]}`));
    expect(note!.title).toMatch(/belum berhasil/);

    await requestData(db, { userId: users[0]!, code: "ZREQB", datasets: ["broker_summary"], now: NOW });
    await requestData(db, { userId: users[0]!, code: "ZREQC", datasets: ["broker_summary"], now: NOW });
    const calls: string[] = [];
    const s = await processRequestQueue(db, provider, makeHandlers(calls, () => "auth"), { dailyDone: true, log: () => {}, now: NOW });
    expect(calls).toHaveLength(1); // berhenti setelah error sistemik pertama
    expect(s.stopped).toMatch(/ArjumAuthError/);
    const left = await db.select().from(schema.dataRequests).where(and(inArray(schema.dataRequests.code, ["ZREQB", "ZREQC"])));
    expect(left.every((x) => x.status === "queued" && x.attempts === 0)).toBe(true);
    await db.delete(schema.providerQuotaUsage).where(inArray(schema.providerQuotaUsage.quotaDate, ["2026-08-15"]));
  });

  it("Pantau lengkap: dibatasi per pengguna, mengantrekan data basi tanpa jatah & tanpa notifikasi, tidak dobel", async () => {
    await setFollow(db, users[4]!, "ZREQA", true);
    await setFollow(db, users[4]!, "ZREQB", true);
    await expect(setFollow(db, users[4]!, "ZREQC", true)).rejects.toThrow(/Maksimal 2/);
    await setFollow(db, users[5]!, "ZREQA", true);
    expect(await enqueueFollows(db, NOW)).toBe(8); // 2 saham × 4 dataset
    expect(await enqueueFollows(db, NOW)).toBe(0);
    const subs = await db
      .select()
      .from(schema.dataRequestSubscribers)
      .innerJoin(schema.dataRequests, eq(schema.dataRequests.id, schema.dataRequestSubscribers.requestId))
      .where(eq(schema.dataRequests.code, "ZREQA"));
    expect(subs).toHaveLength(8); // 4 dataset × 2 pengikut
    expect(subs.every((s) => !s.data_request_subscribers.charged && !s.data_request_subscribers.notify)).toBe(true);
    // Permintaan pengguna tetap didahulukan atas antrean "Pantau lengkap".
    await requestData(db, { userId: users[0]!, code: "ZREQC", datasets: ["broker_summary"], now: NOW });
    expect((await activeQueue(db, NOW))[0]).toMatchObject({ code: "ZREQC", source: "user" });
  });

  it("ditutup admin → permintaan baru ditolak; aksi admin butuh peran admin; saham demo/tak dikenal ditolak", async () => {
    await saveRequestSettings(db, { enabled: false });
    await expect(requestData(db, { userId: users[0]!, code: "ZREQA", datasets: ["financials"], now: NOW })).rejects.toThrow(/ditutup/);
    await saveRequestSettings(db, { enabled: true });
    await expect(requestData(db, { userId: users[0]!, code: "TIDAKADA", datasets: ["financials"], now: NOW })).rejects.toThrow(/tidak ada/);
    await expect(requestData(db, { userId: users[0]!, code: "ZR'; --", datasets: ["financials"], now: NOW })).rejects.toThrow(/tidak valid/);
    await expect(addCodeToScheduleCore("user", "financials", "ZREQA")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

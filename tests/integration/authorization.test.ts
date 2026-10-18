import "@/server/load-env";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema";
import { ForbiddenError } from "@/server/auth/errors";
import {
  addToWatchlistCore,
  assertWatchlistItemOwnedBy,
  getWatchlistCore,
  removeFromWatchlistCore,
} from "@/features/watchlist/core";
import { addNoteCore, deleteNoteCore, getNotesForInstrumentCore } from "@/features/notes/core";
import { createSavedScreenCore, deleteSavedScreenCore, getSavedScreensCore } from "@/features/saved-screens/core";
import { assertAdminRole, getIngestionRunsCore } from "@/features/admin/core";

// Menguji LOGIC OTORISASI SESUNGGUHNYA yang dipakai server actions (bukan
// reimplementasi terpisah) — actions.ts di masing-masing fitur hanya
// memanggil requireUser()/requireAdmin() lalu mendelegasikan ke fungsi *Core
// yang diuji di sini. auth()/next-auth session tidak bisa dipanggil langsung
// di Vitest (butuh request context Next.js), maka currentUserId/role
// dipalsukan secara eksplisit di sini — meniru apa yang requireUser() akan
// berikan dari sesi asli.

const connectionString = process.env.DATABASE_URL;

describe.skipIf(!connectionString)("isolasi otorisasi user A/B dan admin", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let userAId: string;
  let userBId: string;
  let instrumentId: string;
  let instrumentCode: string;

  beforeAll(async () => {
    client = postgres(connectionString!, { max: 1, prepare: false });
    db = drizzle(client, { schema });

    const passwordHash = await bcrypt.hash("test-password-tidak-dipakai", 4);
    const [userA] = await db
      .insert(schema.users)
      .values({ email: `test-a-${Date.now()}@test.local`, passwordHash, name: "Test A", role: "user" })
      .returning();
    const [userB] = await db
      .insert(schema.users)
      .values({ email: `test-b-${Date.now()}@test.local`, passwordHash, name: "Test B", role: "user" })
      .returning();
    userAId = userA!.id;
    userBId = userB!.id;

    const [instrument] = await db.select().from(schema.instruments).limit(1);
    if (!instrument) throw new Error("Database belum di-seed. Jalankan `pnpm db:seed` dahulu.");
    instrumentId = instrument.id;
    instrumentCode = instrument.code;
  }, 30_000);

  afterAll(async () => {
    // Guard: bila beforeAll gagal di tengah jalan, userAId/userBId bisa tetap
    // undefined — postgres.js menolak parameter undefined.
    if (userAId) {
      await db.delete(schema.watchlistItems).where(eq(schema.watchlistItems.userId, userAId));
      await db.delete(schema.notes).where(eq(schema.notes.userId, userAId));
      await db.delete(schema.savedScreens).where(eq(schema.savedScreens.userId, userAId));
      await db.delete(schema.users).where(eq(schema.users.id, userAId));
    }
    if (userBId) {
      await db.delete(schema.watchlistItems).where(eq(schema.watchlistItems.userId, userBId));
      await db.delete(schema.notes).where(eq(schema.notes.userId, userBId));
      await db.delete(schema.savedScreens).where(eq(schema.savedScreens.userId, userBId));
      await db.delete(schema.users).where(eq(schema.users.id, userBId));
    }
    await client.end();
  });

  it("watchlist: user B TIDAK BISA menghapus item watchlist milik user A", async () => {
    await addToWatchlistCore(userAId, instrumentCode);
    const [itemA] = await getWatchlistCore(userAId);
    expect(itemA).toBeDefined();

    // User B mencoba menghapus item milik A dengan itemId yang diketahui/ditebak.
    await removeFromWatchlistCore(userBId, itemA!.itemId);

    // Item A HARUS TETAP ADA — bukti WHERE userId di query benar-benar menyaring.
    const stillThereForA = await getWatchlistCore(userAId);
    expect(stillThereForA.some((i) => i.itemId === itemA!.itemId)).toBe(true);
    await expect(assertWatchlistItemOwnedBy(userAId, itemA!.itemId)).resolves.not.toThrow();
    await expect(assertWatchlistItemOwnedBy(userBId, itemA!.itemId)).rejects.toThrow(ForbiddenError);

    // User A sendiri BISA menghapus miliknya sendiri.
    await removeFromWatchlistCore(userAId, itemA!.itemId);
    const afterOwnDelete = await getWatchlistCore(userAId);
    expect(afterOwnDelete.some((i) => i.itemId === itemA!.itemId)).toBe(false);
  }, 30_000);

  it("notes: user B TIDAK BISA menghapus catatan milik user A (ForbiddenError)", async () => {
    await addNoteCore(userAId, instrumentCode, "Catatan rahasia milik A");
    const [noteA] = await getNotesForInstrumentCore(userAId, instrumentId);
    expect(noteA).toBeDefined();

    // deleteNoteCore MELEMPAR ForbiddenError (bukan mengembalikan {ok:false})
    // saat pemanggil bukan pemilik — requireOwnership() di dalamnya throw.
    await expect(deleteNoteCore(userBId, noteA!.id)).rejects.toThrow(ForbiddenError);

    // Catatan A harus tetap ada setelah upaya B gagal.
    const stillThere = await getNotesForInstrumentCore(userAId, instrumentId);
    expect(stillThere.some((n) => n.id === noteA!.id)).toBe(true);

    const ownDelete = await deleteNoteCore(userAId, noteA!.id);
    expect(ownDelete.ok).toBe(true);
  }, 30_000);

  it("saved_screens: user B TIDAK BISA menghapus filter tersimpan milik user A", async () => {
    await createSavedScreenCore(userAId, "Filter Rahasia A", {
      type: "condition",
      field: "per",
      operator: "lte",
      value: 10,
    });
    const [screenA] = await getSavedScreensCore(userAId);
    expect(screenA).toBeDefined();

    await expect(deleteSavedScreenCore(userBId, screenA!.id)).rejects.toThrow(ForbiddenError);

    const stillThere = await getSavedScreensCore(userAId);
    expect(stillThere.some((s) => s.id === screenA!.id)).toBe(true);

    const ownDelete = await deleteSavedScreenCore(userAId, screenA!.id);
    expect(ownDelete.ok).toBe(true);
  }, 30_000);

  it("admin: pengguna role 'user' ditolak (ForbiddenError), role 'admin' diizinkan", async () => {
    expect(() => assertAdminRole("user")).toThrow(ForbiddenError);
    expect(() => assertAdminRole("admin")).not.toThrow();

    await expect(getIngestionRunsCore("user")).rejects.toThrow(ForbiddenError);
    await expect(getIngestionRunsCore("admin")).resolves.toBeDefined();
  }, 30_000);
});

import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { Pagination } from "@/components/Pagination";
import { daysBetween, EmptyState } from "@/components/ui/section";
import { getMyNotifications } from "@/features/notifications/actions";
import { formatDateTimeWib } from "@/lib/format";
import { paginate, type SearchParamsRecord } from "@/lib/pagination";
import { auth } from "@/server/auth/config";
import { quotaDateWib } from "@/server/quota/budget";

import { MarkAllReadButton, MarkReadButton } from "./mark-read-button";
import { FEATURES } from "@/lib/features";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

function dayGroup(createdAt: Date, today: string): string {
  const d = daysBetween(quotaDateWib(createdAt), today);
  if (d <= 0) return "Hari ini";
  if (d === 1) return "Kemarin";
  if (d < 7) return "Minggu ini";
  return "Sebelumnya";
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  // Dinonaktifkan sementara (src/lib/features.ts) — kode tetap untuk pengembangan berikutnya.
  if (!FEATURES.notifikasi) notFound();
  const params = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/masuk");

  const items = await getMyNotifications();
  const filter = params.tampil === "belum" ? "belum" : "semua";
  const shown = filter === "belum" ? items.filter((i) => !i.readAt) : items;
  const unread = items.filter((i) => !i.readAt).length;
  const pageState = paginate(shown, params, "hal", PER_PAGE);
  const today = quotaDateWib();
  const groups = new Map<string, typeof pageState.items>();
  for (const it of pageState.items) {
    const g = dayGroup(it.createdAt, today);
    groups.set(g, [...(groups.get(g) ?? []), it]);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <section className="animate-rise">
        <p className="kicker">Milik {session.user.name}</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-5xl font-semibold leading-none tracking-tight">Notifikasi</h1>
          <MarkAllReadButton unread={unread} />
        </div>
        <p className="mt-3 text-[1.0625rem] text-ink-700">
          {unread > 0 ? (
            <>
              Ada <strong>{unread} kabar baru</strong> dari pengingat Anda.
            </>
          ) : (
            "Semua kabar sudah dibaca."
          )}{" "}
          Pengingat dicek setiap selesai pembaruan harian.
        </p>
      </section>

      <div role="group" aria-label="Saring notifikasi" className="inline-flex w-fit rounded-full border border-ink-300 bg-card p-1 text-sm">
        {[
          { id: "semua", label: `Semua (${items.length})`, href: "/notifikasi" },
          { id: "belum", label: `Belum dibaca (${unread})`, href: "/notifikasi?tampil=belum" },
        ].map((t) =>
          t.id === filter ? (
            <span key={t.id} aria-current="true" className="rounded-full bg-ink-900 px-4 py-1.5 font-medium text-paper">
              {t.label}
            </span>
          ) : (
            <Link key={t.id} href={t.href} className="rounded-full px-4 py-1.5 font-medium text-ink-700 hover:bg-ink-100">
              {t.label}
            </Link>
          ),
        )}
      </div>

      <Pagination variant="top" state={pageState} path="/notifikasi" params={params} paramKey="hal" defaultSize={PER_PAGE} unit="notifikasi" />

      {shown.length === 0 ? (
        <EmptyState title={filter === "belum" ? "Tidak ada notifikasi yang belum dibaca." : "Belum ada notifikasi."} icon="♪">
          Buat pengingat dari halaman detail saham — bagian <strong>Catatan &amp; pengingat</strong>. Misalnya &ldquo;beri tahu saya bila harga BBCA
          turun ke 5.800&rdquo;.{" "}
          <Link href="/watchlist" className="underline underline-offset-2">
            Buka watchlist →
          </Link>
        </EmptyState>
      ) : (
        [...groups.entries()].map(([group, list]) => (
          <section key={group} aria-label={group}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">{group}</h2>
            <ul className="overflow-hidden rounded-md border border-ink-200 bg-card">
              {list.map((item) => (
                <li key={item.id} className={`flex gap-3 border-b border-ink-100 px-4 py-4 last:border-0 ${item.readAt ? "" : "bg-kunyit-50/70"}`}>
                  <span aria-hidden className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${item.readAt ? "bg-ink-200" : "bg-kunyit-500"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className={`text-[1.0625rem] ${item.readAt ? "text-ink-800" : "font-semibold text-ink-900"}`}>
                        {item.title}
                        {!item.readAt && <span className="sr-only"> (belum dibaca)</span>}
                      </p>
                      <span className="num text-xs text-ink-500">{formatDateTimeWib(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-700">{item.body}</p>
                    {!item.readAt && (
                      <div className="mt-2">
                        <MarkReadButton notificationId={item.id} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Pagination variant="bottom" state={pageState} path="/notifikasi" params={params} paramKey="hal" defaultSize={PER_PAGE} unit="notifikasi" />
    </div>
  );
}

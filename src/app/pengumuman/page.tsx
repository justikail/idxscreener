import { notFound } from "next/navigation";
import Link from "next/link";

import { Pagination } from "@/components/Pagination";
import { getAnnouncements } from "@/server/db/queries";
import { formatDateId } from "@/lib/format";
import { paginate, type SearchParamsRecord } from "@/lib/pagination";
import { FEATURES } from "@/lib/features";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  // Dinonaktifkan sementara (src/lib/features.ts) — kode tetap untuk pengembangan berikutnya.
  if (!FEATURES.pengumuman) notFound();
  const params = await searchParams;
  const all = await getAnnouncements(undefined, 500);
  const pageState = paginate(all, params, "hal", PER_PAGE);
  const announcements = pageState.items;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Pengumuman / Keterbukaan Informasi</h1>
      <Pagination variant="top" state={pageState} path="/pengumuman" params={params} paramKey="hal" defaultSize={PER_PAGE} unit="pengumuman" />
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {announcements.map((a) => (
          <li key={a.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-900">{a.title}</span>
              <span className="text-slate-500">{formatDateId(a.publishedAt)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="rounded bg-slate-100 px-2 py-0.5">{a.category}</span>
              {a.instrumentCode && (
                <Link href={`/saham/${a.instrumentCode}`} className="underline">
                  {a.instrumentCode}
                </Link>
              )}
            </div>
          </li>
        ))}
        {announcements.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Belum ada pengumuman.</li>}
      </ul>
      <Pagination variant="bottom" state={pageState} path="/pengumuman" params={params} paramKey="hal" defaultSize={PER_PAGE} unit="pengumuman" />
    </div>
  );
}

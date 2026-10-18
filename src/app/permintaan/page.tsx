import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { Chip, EmptyState, SectionHeader, StatTile } from "@/components/ui/section";
import { FollowToggle, LeaveRequestButton } from "@/features/requests/buttons";
import { formatDateTimeWib } from "@/lib/format";
import { auth } from "@/server/auth/config";
import { db } from "@/server/db/client";
import { chargedToday, getRequestSettings, myFollows, myRequests, popularRequests, USER_DATASET_INFO, USER_DATASETS } from "@/server/requests/core";
import { FEATURES } from "@/lib/features";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { text: string; tone: "good" | "warn" | "bad" | "neutral"; icon: string }> = {
  queued: { text: "Menunggu", tone: "warn", icon: "⏳" },
  running: { text: "Sedang diambil", tone: "warn", icon: "↻" },
  done: { text: "Selesai", tone: "good", icon: "✓" },
  failed: { text: "Gagal", tone: "bad", icon: "✕" },
  cancelled: { text: "Dibatalkan", tone: "neutral", icon: "–" },
};

const FAQ: Array<[string, string]> = [
  [
    "Kenapa datanya tidak langsung muncul?",
    "Kami mengambil data dari Pihak Ketiga dengan kuota harian terbatas. Permintaan dikerjakan bergiliran setiap sore setelah harga harian diperbarui, jadi bisa perlu satu sampai beberapa hari.",
  ],
  [
    "Apa itu jatah harian?",
    "Jumlah permintaan BARU yang boleh Anda buat per hari, supaya antrean adil untuk semua. Jatah kembali penuh setiap pukul 00.00 WIB. Membatalkan permintaan yang belum diproses juga mengembalikan jatah.",
  ],
  [
    "Apa bedanya 'masuk antrean' dan 'ikut antre'?",
    "Kalau belum ada yang meminta data itu, permintaan Anda membuka antrean baru (memakai 1 jatah). Kalau orang lain sudah meminta, Anda cukup ikut antre — tidak memakai jatah, dan tetap dapat notifikasi saat siap.",
  ],
  [
    "Apa itu 'Pantau lengkap'?",
    "Untuk saham yang paling Anda perhatikan. Sistem otomatis mengantrekan data yang mulai lama, tanpa memakai jatah dan tanpa notifikasi berulang. Jumlah saham dibatasi per orang.",
  ],
  [
    "Apakah data yang saya minta bisa dilihat orang lain?",
    "Ya. Data pasar disimpan sekali dan dipakai semua pengguna — itulah yang membuat kuota cukup. Yang tidak terlihat orang lain hanyalah daftar permintaan, catatan, dan pengingat Anda.",
  ],
];

export default async function RequestsPage() {
  // Dinonaktifkan sementara (src/lib/features.ts) — kode tetap untuk pengembangan berikutnya.
  if (!FEATURES.permintaanData) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/masuk");
  const userId = session.user.id;
  const now = new Date();
  const [settings, used, mine, follows, popular] = await Promise.all([
    getRequestSettings(db),
    chargedToday(db, userId, now),
    myRequests(db, userId, now),
    myFollows(db, userId),
    popularRequests(db, now, 30, 8),
  ]);
  const active = mine.filter((r) => r.status === "queued" || r.status === "running");
  const history = mine.filter((r) => r.status !== "queued" && r.status !== "running");
  const remaining = Math.max(0, settings.perUserDaily - used);

  return (
    <div className="flex flex-col gap-10">
      <section className="animate-rise">
        <p className="kicker">Milik {session.user.name}</p>
        <h1 className="mt-3 font-display text-5xl font-semibold leading-none tracking-tight sm:text-6xl">
          Permintaan <em className="font-normal text-kunyit-600">data</em>
        </h1>
        <p className="mt-4 max-w-2xl text-[1.1875rem] leading-relaxed text-ink-800">
          Minta laporan keuangan, ringkasan broker, transaksi insider, atau akumulasi broker untuk saham yang Anda pedulikan. Data diambil sekali dan
          dipakai bersama semua pengguna.
        </p>
        {!settings.enabled && (
          <p className="mt-4 rounded-md border border-kunyit-300 bg-kunyit-50 px-4 py-3 text-[1.0625rem] text-kunyit-900">
            Permintaan baru sedang ditutup oleh admin. Antrean yang ada tetap tersimpan.
          </p>
        )}
      </section>

      <dl className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Jatah permintaan baru hari ini"
          value={
            <>
              {remaining}
              <span className="text-base font-normal text-ink-500"> / {settings.perUserDaily}</span>
            </>
          }
          sub={
            <>
              <span className="mt-1 block h-2 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                <span className="block h-full rounded-full bg-kunyit-500" style={{ width: `${settings.perUserDaily ? (remaining / settings.perUserDaily) * 100 : 0}%` }} />
              </span>
              <span className="mt-1 block">Kembali penuh pukul 00.00 WIB. Ikut antre tidak memakai jatah.</span>
            </>
          }
        />
        <StatTile label="Sedang antre" value={active.length} sub={active.length ? "Diproses setiap sore setelah harga harian diperbarui." : "Tidak ada yang sedang ditunggu."} />
        <StatTile
          label="Dipantau lengkap"
          value={
            <>
              {follows.length}
              <span className="text-base font-normal text-ink-500"> / {settings.maxFollows}</span>
            </>
          }
          sub="Data yang mulai lama diantrekan otomatis."
        />
      </dl>

      <section aria-labelledby="cara-kerja">
        <SectionHeader id="cara-kerja" title="Cara kerja" eyebrow="Tiga langkah" />
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Buka halaman saham", "Di bawah ringkasan “Sekilas” ada panel Kelengkapan data. Centang data yang belum ada atau sudah lama, lalu tekan Minta."],
            ["2", "Tunggu giliran", "Permintaan masuk antrean bersama. Kalau orang lain sudah meminta data yang sama, Anda cukup ikut antre tanpa memakai jatah."],
            ["3", "Dapat kabar", "Saat data siap, notifikasi muncul di menu Notifikasi. Data langsung tampil di halaman saham untuk semua pengguna."],
          ].map(([n, t, d]) => (
            <li key={n} className="flex gap-4 rounded-md border border-ink-200 bg-card p-4">
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-kunyit-400 text-lg font-bold text-ink-950">
                {n}
              </span>
              <span>
                <span className="block text-[1.0625rem] font-semibold">{t}</span>
                <span className="mt-1 block text-[0.9375rem] leading-relaxed text-ink-700">{d}</span>
              </span>
            </li>
          ))}
        </ol>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {USER_DATASETS.map((d) => (
            <li key={d} className="rounded-md bg-card/60 px-4 py-3 text-[0.9375rem]">
              <strong>{USER_DATASET_INFO[d].label}</strong> — {USER_DATASET_INFO[d].what} <span className="text-ink-500">({USER_DATASET_INFO[d].freshText}.)</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="antre">
        <SectionHeader id="antre" title="Sedang antre" chips={active.length ? <Chip tone="warn">{active.length} permintaan</Chip> : undefined} />
        {active.length === 0 ? (
          <EmptyState title="Tidak ada permintaan yang sedang menunggu." icon="⏳">
            Buka halaman saham, misalnya{" "}
            <Link href="/saham/BBCA#kelengkapan" className="underline underline-offset-2">
              BBCA
            </Link>
            , lalu gunakan panel <strong>Kelengkapan data</strong>.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 rounded-md border border-ink-200 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link href={`/saham/${r.code}#kelengkapan`} className="num text-lg font-bold hover:text-kunyit-700">
                      {r.code}
                    </Link>
                    <span className="font-medium">{r.label}</span>
                    <Chip tone={STATUS[r.status]!.tone} icon={STATUS[r.status]!.icon}>
                      {STATUS[r.status]!.text}
                    </Chip>
                    {r.source === "follow" && <Chip>Pantau lengkap</Chip>}
                  </p>
                  <p className="mt-1 text-[0.9375rem] text-ink-700">
                    {r.status === "running" ? "Sedang diambil sekarang." : `Antrean ke-${r.position} · perkiraan ${r.eta}`} · {r.requesters} peminta ·{" "}
                    {r.charged ? "memakai 1 jatah Anda" : "tanpa jatah (ikut antre)"}
                  </p>
                </div>
                {r.status === "queued" && <LeaveRequestButton requestId={r.id} label={r.charged ? "Batalkan" : "Keluar dari antrean"} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pantau">
        <SectionHeader
          id="pantau"
          title="Dipantau lengkap"
          takeaway={`Keempat data tambahan saham ini dijaga tetap terbaru secara otomatis. Maksimal ${settings.maxFollows} saham.`}
        />
        {follows.length === 0 ? (
          <EmptyState title="Belum ada saham yang dipantau lengkap." icon="◉">
            Tekan <strong>Pantau lengkap</strong> di panel Kelengkapan data halaman saham, atau di kartu watchlist.
          </EmptyState>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {follows.map((f) => (
              <li key={f.instrumentId} className="flex items-center justify-between gap-3 rounded-md border border-ink-200 bg-card px-4 py-3">
                <Link href={`/saham/${f.code}`} className="min-w-0">
                  <span className="num font-bold">{f.code}</span>
                  <span className="block truncate text-sm text-ink-600">{f.name}</span>
                </Link>
                <FollowToggle code={f.code} initial />
              </li>
            ))}
          </ul>
        )}
      </section>

      {popular.length > 0 && (
        <section aria-labelledby="populer">
          <SectionHeader id="populer" title="Paling banyak diminta" eyebrow="30 hari terakhir" takeaway="Ikut meminta data yang sudah diminta orang lain tidak memakai jatah Anda." />
          <ul className="grid gap-2 sm:grid-cols-2">
            {popular.map((p) => (
              <li key={`${p.code}-${p.dataset}`}>
                <Link href={`/saham/${p.code}#kelengkapan`} className="flex items-center justify-between gap-3 rounded-md border border-ink-200 bg-card px-4 py-3 hover:border-ink-900">
                  <span>
                    <span className="num font-bold">{p.code}</span> <span className="text-ink-700">{p.label}</span>
                  </span>
                  <span className="text-sm text-ink-600">{p.requesters} peminta →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="riwayat">
        <SectionHeader id="riwayat" title="Riwayat 30 hari" />
        {history.length === 0 ? (
          <p className="text-[0.9375rem] text-ink-600">Belum ada riwayat.</p>
        ) : (
          <ul className="overflow-hidden rounded-md border border-ink-200 bg-card">
            {history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3 last:border-0">
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/saham/${r.code}`} className="num font-bold hover:text-kunyit-700">
                    {r.code}
                  </Link>
                  <span>{r.label}</span>
                  <Chip tone={STATUS[r.status]?.tone ?? "neutral"} icon={STATUS[r.status]?.icon}>
                    {STATUS[r.status]?.text ?? r.status}
                  </Chip>
                </span>
                <span className="text-sm text-ink-500">{r.finishedAt ? formatDateTimeWib(r.finishedAt) : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="tanya">
        <SectionHeader id="tanya" title="Tanya jawab" />
        <div className="flex flex-col gap-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-md border border-ink-200 bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[1.0625rem] font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <span aria-hidden className="font-mono text-sm text-ink-400 transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <p className="border-t border-ink-200 px-4 py-3 text-[0.9375rem] leading-relaxed text-ink-700">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { requestStockData, toggleFollow } from "./actions";

export type DatasetStatus = {
  dataset: string;
  label: string;
  what: string;
  lastSuccessAt: string | null;
  fresh: boolean;
  queued: { id: number; status: string; position: number; requesters: number; eta: string; mine: boolean } | null;
};

const OUTCOME_TEXT: Record<string, string> = {
  queued: "masuk antrean (memakai 1 jatah)",
  joined: "sudah diminta orang lain — Anda ikut antre, tanpa memakai jatah",
  already: "Anda sudah ikut antre",
  fresh: "sudah terbaru, tidak perlu diminta",
  limit: "jatah hari ini habis — coba lagi besok",
};

function relative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hari ini";
  if (days === 1) return "kemarin";
  if (days < 14) return `${days} hari lalu`;
  return `${Math.round(days / 7)} minggu lalu`;
}

/**
 * Panel "Kelengkapan data" di halaman saham: status 4 data tambahan, minta
 * yang belum ada, dan "Pantau lengkap". Tidak pernah memanggil penyedia —
 * hanya menulis ke antrean yang dikerjakan worker.
 */
export function DataRequestPanel(p: {
  code: string;
  statuses: DatasetStatus[];
  loggedIn: boolean;
  enabled: boolean;
  remaining: number;
  perUserDaily: number;
  following: boolean;
  followCount: number;
  maxFollows: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const requestable = p.statuses.filter((s) => !s.fresh && !s.queued?.mine);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(requestable.map((s) => s.dataset)));
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [following, setFollowing] = useState(p.following);
  const [followMsg, setFollowMsg] = useState<string | null>(null);
  const freshCount = p.statuses.filter((s) => s.fresh).length;
  const pickedList = useMemo(() => [...picked].filter((d) => requestable.some((s) => s.dataset === d)), [picked, requestable]);
  // Data yang sudah diantrekan orang lain: ikut antre, tidak memakai jatah.
  const joinCount = pickedList.filter((d) => p.statuses.find((s) => s.dataset === d)?.queued).length;
  const newCount = pickedList.length - joinCount;

  const submit = () =>
    start(async () => {
      const r = await requestStockData(p.code, pickedList);
      if (!r.ok) {
        setMsg({ ok: false, lines: [r.error] });
        return;
      }
      setMsg({
        ok: true,
        lines: [
          ...r.results.map((x) => `${p.statuses.find((s) => s.dataset === x.dataset)?.label}: ${OUTCOME_TEXT[x.outcome]}.`),
          `Sisa jatah hari ini: ${r.remaining} dari ${r.perUserDaily}. Kabar akan masuk ke Notifikasi saat data siap.`,
        ],
      });
      router.refresh();
    });

  const flipFollow = () =>
    start(async () => {
      const next = !following;
      const r = await toggleFollow(p.code, next);
      if (!r.ok) {
        setFollowMsg(r.error);
        return;
      }
      setFollowing(r.following);
      setFollowMsg(
        r.following
          ? `${p.code} dipantau lengkap (${r.count}/${r.max}). Data yang mulai lama akan diantrekan otomatis, tanpa memakai jatah harian.`
          : `${p.code} tidak lagi dipantau lengkap (${r.count}/${r.max}).`,
      );
      router.refresh();
    });

  return (
    <section aria-labelledby="kelengkapan-judul" id="kelengkapan" className="scroll-mt-20 rounded-md border border-ink-300 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="kelengkapan-judul" className="text-lg font-semibold">
            Kelengkapan data {p.code}
          </h2>
          <p className="mt-0.5 text-sm text-ink-600">
            {freshCount} dari {p.statuses.length} data tambahan sudah terbaru. Data dipakai bersama: cukup diminta sekali, semua pengguna ikut menikmati.
          </p>
        </div>
        {p.loggedIn && p.enabled && (
          <button
            type="button"
            onClick={flipFollow}
            disabled={pending}
            aria-pressed={following}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              following ? "border-ink-900 bg-ink-900 text-paper" : "border-ink-900 text-ink-900 hover:bg-ink-900 hover:text-paper"
            }`}
            title="Jaga keempat data ini tetap terbaru secara otomatis"
          >
            <span aria-hidden>{following ? "◉" : "○"}</span>
            {following ? "Dipantau lengkap" : "Pantau lengkap"}
          </button>
        )}
      </div>
      {followMsg && (
        <p aria-live="polite" className="mt-2 text-sm text-ink-700">
          {followMsg}
        </p>
      )}

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {p.statuses.map((s) => {
          const canPick = p.loggedIn && p.enabled && !s.fresh && !s.queued?.mine;
          const checked = picked.has(s.dataset) && canPick;
          return (
            <li key={s.dataset}>
              <label
                className={`flex h-full gap-3 rounded-md border p-3 ${canPick ? "cursor-pointer hover:border-ink-900" : ""} ${
                  checked ? "border-ink-900 bg-paper" : "border-ink-200 bg-paper/60"
                }`}
              >
                {p.loggedIn && p.enabled && (
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-ink-900"
                    disabled={!canPick || pending}
                    checked={checked}
                    onChange={(e) =>
                      setPicked((prev) => {
                        const n = new Set(prev);
                        if (e.target.checked) n.add(s.dataset);
                        else n.delete(s.dataset);
                        return n;
                      })
                    }
                  />
                )}
                <span className="min-w-0">
                  <span className="block font-semibold">{s.label}</span>
                  <span className="block text-sm leading-snug text-ink-600">{s.what}</span>
                  <span className="mt-1.5 block text-sm">
                    {s.queued ? (
                      <span className="text-kunyit-800">
                        ⏳ {s.queued.status === "running" ? "Sedang diambil" : `Antrean ke-${s.queued.position} · perkiraan ${s.queued.eta}`}
                        {` · ${s.queued.requesters} peminta`}
                        {s.queued.mine ? " (termasuk Anda)" : p.loggedIn && p.enabled ? " · centang untuk ikut antre, gratis" : ""}
                      </span>
                    ) : s.fresh ? (
                      <span className="text-up-700">✓ Terbaru · diambil {relative(s.lastSuccessAt!)}</span>
                    ) : s.lastSuccessAt ? (
                      <span className="text-ink-700">◷ Perlu diperbarui · terakhir {relative(s.lastSuccessAt)}</span>
                    ) : (
                      <span className="text-ink-500">○ Belum ada</span>
                    )}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!p.loggedIn ? (
          <>
            <Link href="/masuk" className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-paper hover:bg-ink-700">
              Masuk untuk meminta data
            </Link>
            <span className="text-sm text-ink-600">Gratis. Setelah masuk, centang data yang Anda perlukan.</span>
          </>
        ) : !p.enabled ? (
          <span className="text-sm text-ink-600">Permintaan data sedang ditutup oleh admin. Data yang sudah ada tetap bisa dilihat.</span>
        ) : requestable.length === 0 ? (
          <span className="text-sm text-up-700">Semua data sudah terbaru atau sedang Anda tunggu. Tidak ada yang perlu diminta.</span>
        ) : (
          <>
            <button
              type="button"
              onClick={submit}
              disabled={pending || pickedList.length === 0}
              className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-paper hover:bg-ink-700 disabled:opacity-40"
            >
              {pending
                ? "Mencatat…"
                : newCount === 0 && joinCount > 0
                  ? `Ikut antre ${joinCount} data (gratis)`
                  : `Minta ${pickedList.length} data terpilih`}
            </button>
            <span className="text-sm text-ink-600">
              {pickedList.length > 0 && (
                <>
                  Memakai <strong>{newCount}</strong> jatah{joinCount > 0 ? `, ${joinCount} ikut antre gratis` : ""}.{" "}
                </>
              )}
              Sisa jatah hari ini: <strong>{p.remaining}</strong> dari {p.perUserDaily}.
            </span>
          </>
        )}
        {p.loggedIn && (
          <Link href="/permintaan" className="text-sm font-medium underline underline-offset-4 hover:text-ink-900">
            Permintaan saya →
          </Link>
        )}
      </div>
      {msg && (
        <ul aria-live="polite" className={`mt-3 space-y-0.5 rounded-md px-4 py-3 text-sm ${msg.ok ? "bg-up-50 text-up-900" : "bg-down-50 text-down-800"}`}>
          {msg.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}

      <details className="group mt-4 border-t border-ink-200 pt-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-ink-700 hover:text-ink-900 [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span> Bagaimana cara kerjanya?
        </summary>
        <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          {[
            ["1", "Centang & minta", "Pilih data yang belum ada atau sudah lama, lalu tekan Minta. Kalau datanya masih baru, kami tidak meminta ulang."],
            ["2", "Masuk antrean bersama", "Satu saham diambil sekali untuk semua orang. Jika orang lain sudah meminta, Anda cukup ikut antre — gratis jatah."],
            ["3", "Kabar di Notifikasi", "Antrean diproses setiap sore setelah harga harian diperbarui. Saat data siap, Anda mendapat notifikasi."],
          ].map(([n, t, d]) => (
            <li key={n} className="flex gap-3 rounded-md bg-paper p-3">
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-kunyit-400 font-bold text-ink-950">
                {n}
              </span>
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="block leading-snug text-ink-700">{d}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-ink-600">
          <strong>Pantau lengkap</strong> menjaga keempat data saham ini tetap terbaru secara otomatis (maks. {p.maxFollows} saham per orang), tanpa memakai jatah
          harian. Kuota pengambilan data terbatas, jadi antrean bisa memerlukan beberapa hari.
        </p>
      </details>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { addToWatchlist, removeFromWatchlistByCode } from "./actions";

/**
 * Tombol dua arah: status awal dari server (sudah/belum di watchlist), berubah
 * seketika saat diklik dan dikembalikan bila aksi server gagal.
 */
export function WatchlistToggle({ instrumentCode, initialInWatchlist }: { instrumentCode: string; initialInWatchlist: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(initialInWatchlist);
  // Setelah klik, kursor masih di atas tombol: jangan langsung menawarkan
  // "Hapus" sampai kursor keluar dulu.
  const [justToggled, setJustToggled] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; link?: boolean } | null>(null);

  // Tidak memakai `disabled` (menonaktifkan tombol memicu blur) dan tidak
  // menunggu router.refresh(): tombol siap lagi begitu aksi server selesai.
  const toggle = async () => {
    if (busy) return;
    const next = !inWatchlist;
    setBusy(true);
    setInWatchlist(next);
    setJustToggled(true);
    setMessage(null);
    try {
      const result = next ? await addToWatchlist(instrumentCode) : await removeFromWatchlistByCode(instrumentCode);
      if (!result.ok) throw new Error(result.error ?? "Gagal.");
      setMessage(next ? { tone: "ok", text: "Tersimpan di watchlist.", link: true } : { tone: "ok", text: "Dihapus dari watchlist." });
      router.refresh();
    } catch (error) {
      setInWatchlist(!next);
      setMessage({ tone: "error", text: error instanceof Error && error.message ? `Gagal: ${error.message}` : "Gagal menyimpan. Coba lagi." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={toggle}
        onPointerLeave={() => setJustToggled(false)}
        onBlur={() => setJustToggled(false)}
        aria-busy={busy}
        aria-pressed={inWatchlist}
        className={`group inline-flex items-center gap-2 rounded-sm border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors aria-busy:cursor-wait ${
          inWatchlist
            ? `border-ink-900 bg-ink-900 text-paper ${justToggled ? "" : "hover:border-down-500 hover:bg-down-500"}`
            : "border-ink-900 text-ink-900 hover:bg-ink-900 hover:text-paper"
        }`}
      >
        <span aria-hidden className={`text-sm leading-none ${inWatchlist ? `text-kunyit-400 ${justToggled ? "" : "group-hover:text-paper"}` : ""}`}>
          {inWatchlist ? "★" : "☆"}
        </span>
        {inWatchlist && justToggled ? (
          <span>Di watchlist</span>
        ) : inWatchlist ? (
          <>
            <span className="group-hover:hidden group-focus-visible:hidden">Di watchlist</span>
            <span className="hidden group-hover:inline group-focus-visible:inline">Hapus dari watchlist</span>
          </>
        ) : (
          <span>Tambah ke watchlist</span>
        )}
      </button>
      <span aria-live="polite" className={`text-xs ${message?.tone === "error" ? "text-down-600" : "text-ink-500"}`}>
        {message?.text}
        {message?.link && (
          <>
            {" "}
            <Link href="/watchlist" className="underline underline-offset-2 hover:text-ink-900">
              Lihat watchlist →
            </Link>
          </>
        )}
      </span>
    </div>
  );
}

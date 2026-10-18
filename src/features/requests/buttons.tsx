"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { leaveMyRequest, toggleFollow } from "./actions";

/** Keluar dari antrean. Jika tidak ada peminta lain, permintaan dibatalkan dan jatah kembali. */
export function LeaveRequestButton({ requestId, label = "Batalkan" }: { requestId: number; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirm)
    return (
      <button type="button" onClick={() => setConfirm(true)} className="rounded-full px-3 py-1 text-sm text-down-700 hover:bg-down-50">
        {label}
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span>Yakin?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await leaveMyRequest(requestId);
            if (!r.ok) setError(r.error);
            else router.refresh();
          })
        }
        className="rounded-full bg-down-600 px-3 py-1 font-semibold text-paper disabled:opacity-50"
      >
        Ya
      </button>
      <button type="button" onClick={() => setConfirm(false)} className="rounded-full px-3 py-1 hover:bg-ink-100">
        Tidak
      </button>
      {error && <span className="text-down-700">{error}</span>}
    </span>
  );
}

/** Sakelar "Pantau lengkap" (dipakai di watchlist dan halaman permintaan). */
export function FollowToggle({ code, initial, compact = false }: { code: string; initial: boolean; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        aria-pressed={on}
        disabled={pending}
        title={on ? "Berhenti menjaga data tambahan saham ini tetap terbaru" : "Jaga laporan keuangan, broker, insider, dan akumulasi saham ini tetap terbaru otomatis"}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await toggleFollow(code, !on);
            if (!r.ok) setError(r.error);
            else {
              setOn(r.following);
              router.refresh();
            }
          })
        }
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors disabled:opacity-50 ${
          on ? "border-ink-900 bg-ink-900 text-paper" : "border-ink-300 text-ink-700 hover:border-ink-900"
        }`}
      >
        <span aria-hidden>{on ? "◉" : "○"}</span>
        {on ? (compact ? "Dipantau" : "Dipantau lengkap") : compact ? "Pantau" : "Pantau lengkap"}
      </button>
      {error && <span className="max-w-[16rem] text-right text-xs text-down-700">{error}</span>}
    </span>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { removeFromWatchlist } from "@/features/watchlist/actions";

export function RemoveWatchlistButton({ itemId, code }: { itemId: number; code: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label={`Hapus ${code} dari watchlist`}
      onClick={() => {
        startTransition(async () => {
          await removeFromWatchlist(itemId);
          router.refresh();
        });
      }}
      className="rounded-full px-3 py-1 text-sm text-ink-600 hover:bg-down-50 hover:text-down-700 disabled:opacity-50"
    >
      {isPending ? "Menghapus…" : "Hapus"}
    </button>
  );
}

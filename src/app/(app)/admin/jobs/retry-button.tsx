"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { retryComputeJob } from "@/features/admin/actions";

export function RetryJobButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-xs text-ink-600">{message}</span>}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await retryComputeJob();
            setMessage(result.ok ? "Job berhasil dijalankan ulang." : `Gagal: ${result.error}`);
            router.refresh();
          });
        }}
        className="rounded-full border border-ink-900 px-4 py-1.5 text-sm font-semibold text-ink-900 hover:bg-ink-900 hover:text-paper disabled:opacity-50"
      >
        {isPending ? "Menjalankan..." : "Hitung ulang indikator"}
      </button>
    </div>
  );
}

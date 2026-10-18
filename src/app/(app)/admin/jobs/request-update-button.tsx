"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { requestDailyUpdate } from "@/features/admin/actions";

export function RequestDailyUpdateButton({ externalScheduler = false }: { externalScheduler?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await requestDailyUpdate();
            if (!result.ok) setMessage({ tone: "error", text: result.error ?? "Gagal." });
            else if (externalScheduler)
              setMessage({ tone: "ok", text: "Permintaan dicatat. Diproses pada jadwal GitHub Actions berikutnya, atau jalankan workflow data-jobs secara manual di GitHub." });
            else if (!result.workerActive)
              setMessage({ tone: "warn", text: "Permintaan dicatat, tetapi worker tidak berjalan. Jalankan `pnpm worker` agar dikerjakan." });
            else setMessage({ tone: "ok", text: "Permintaan dicatat. Worker akan mengerjakannya dalam ±1 menit." });
            router.refresh();
          });
        }}
        className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-paper hover:bg-ink-700 disabled:opacity-50"
      >
        {isPending ? "Mencatat…" : "Jalankan pembaruan sekarang"}
      </button>
      {message && (
        <p
          aria-live="polite"
          className={`text-xs ${message.tone === "error" ? "text-down-600" : message.tone === "warn" ? "text-kunyit-800" : "text-ink-600"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { markAllNotificationsRead, markNotificationRead } from "@/features/notifications/actions";

export function MarkReadButton({ notificationId }: { notificationId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await markNotificationRead(notificationId);
          router.refresh();
        })
      }
      className="rounded-full border border-ink-300 px-3 py-1 text-xs font-medium text-ink-700 hover:border-ink-900 hover:text-ink-900 disabled:opacity-50"
    >
      {isPending ? "…" : "Tandai dibaca"}
    </button>
  );
}

export function MarkAllReadButton({ unread }: { unread: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  if (unread === 0) return null;
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await markAllNotificationsRead();
          router.refresh();
        })
      }
      className="rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-paper hover:bg-ink-700 disabled:opacity-50"
    >
      {isPending ? "Menandai…" : `Tandai ${unread} dibaca`}
    </button>
  );
}

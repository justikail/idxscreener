"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

/** Dropdown pilihan daftar: mengganti ?daftar= dan kembali ke halaman 1 (jumlah baris tetap). */
export function ListSelect({ options, value }: { options: Array<{ key: string; label: string }>; value: string }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-600">Tampilkan:</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const sp = new URLSearchParams(window.location.search);
          sp.set("daftar", e.target.value);
          sp.delete("hal");
          start(() => router.push(`${path}?${sp.toString()}#daftar`, { scroll: false }));
        }}
        className="rounded-full border border-ink-900 bg-card px-4 py-2 text-[0.9375rem] font-semibold disabled:opacity-60 focus:outline-none focus-visible:outline-2 focus-visible:outline-kunyit-500"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

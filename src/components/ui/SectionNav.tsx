"use client";

import { useEffect, useRef, useState } from "react";

export type NavSection = { id: string; label: string; hasData: boolean };

/**
 * Daftar isi yang menempel saat menggulir. Bagian yang sedang dibaca
 * tersorot; titik penuh = ada data, titik kosong = data belum tersedia,
 * sehingga pengguna tahu sebelum menggulir jauh.
 */
export function SectionNav({ sections, label = "Isi halaman" }: { sections: NavSection[]; label?: string }) {
  const [current, setCurrent] = useState<string | null>(sections[0]?.id ?? null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => Boolean(e));
    if (els.length === 0) return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity);
        const best = [...visible.entries()].filter(([, top]) => top !== Infinity).sort((a, b) => a[1] - b[1])[0];
        if (best) setCurrent(best[0]);
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  // Pastikan tautan aktif terlihat di daftar yang bisa digeser (ponsel).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-id="${current}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [current]);

  return (
    <nav aria-label={label} className="sticky top-0 z-30 -mx-4 border-y border-ink-900 bg-paper/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <ul ref={listRef} className="relative flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => {
          const active = s.id === current;
          return (
            <li key={s.id} data-id={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={active ? "location" : undefined}
                className={`relative flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-ink-900 text-paper" : "text-ink-700 hover:bg-ink-100 hover:text-ink-900"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${s.hasData ? (active ? "bg-kunyit-400" : "bg-up-500") : `border ${active ? "border-paper/70" : "border-ink-400"}`}`}
                />
                {s.label}
                {!s.hasData && <span className="sr-only">(data belum tersedia)</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

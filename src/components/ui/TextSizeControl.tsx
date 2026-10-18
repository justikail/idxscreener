"use client";

import { useEffect, useState } from "react";

const SIZES = [
  { id: "normal", label: "A", scale: 1, name: "Teks normal" },
  { id: "besar", label: "A+", scale: 1.125, name: "Teks besar" },
  { id: "sangat", label: "A++", scale: 1.25, name: "Teks sangat besar" },
] as const;
const KEY = "ukuran-teks";

/**
 * Pilihan ukuran teks untuk seluruh situs (berguna bagi pembaca yang lebih
 * tua atau di layar kecil). Seluruh tata letak memakai rem, jadi mengubah
 * ukuran huruf dasar ikut memperbesar angka, tombol, dan jarak.
 * Pilihan disimpan per browser; bila penyimpanan diblokir, tetap berfungsi
 * untuk kunjungan ini saja.
 */
export function TextSizeControl() {
  const [size, setSize] = useState<string>("normal");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && SIZES.some((s) => s.id === saved)) setSize(saved);
    } catch {}
  }, []);

  useEffect(() => {
    const s = SIZES.find((x) => x.id === size) ?? SIZES[0];
    document.documentElement.style.fontSize = s.scale === 1 ? "" : `${s.scale * 100}%`;
    try {
      localStorage.setItem(KEY, size);
    } catch {}
  }, [size]);

  return (
    <div role="group" aria-label="Ukuran teks" className="flex items-center overflow-hidden rounded-full border border-ink-600 normal-case tracking-normal">
      {SIZES.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-pressed={size === s.id}
          title={s.name}
          onClick={() => setSize(s.id)}
          className={`px-2 py-0.5 font-sans text-[11px] font-semibold leading-tight transition-colors ${
            size === s.id ? "bg-kunyit-400 text-ink-950" : "text-ink-300 hover:bg-ink-800 hover:text-paper"
          }`}
        >
          {s.label}
          <span className="sr-only"> — {s.name}</span>
        </button>
      ))}
    </div>
  );
}

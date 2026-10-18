"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <p className="kicker text-down-500">Gangguan memuat data</p>
      <h1 className="mt-3 font-display text-5xl font-semibold leading-tight tracking-tight">
        Halaman ini gagal <em className="font-normal text-down-500">dimuat</em>.
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-ink-700">
        Biasanya karena koneksi ke database terputus sesaat. Data tidak diganti dengan data demo atau angka perkiraan —
        lebih baik tidak menampilkan apa-apa daripada menampilkan yang salah.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="bg-ink-900 px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-paper hover:bg-ink-700"
        >
          Coba lagi
        </button>
        <Link href="/" className="font-mono text-xs uppercase tracking-[0.16em] underline underline-offset-4">
          Ke dashboard
        </Link>
      </div>
      {error.digest && <p className="num mt-8 text-xs text-ink-400">Kode kejadian: {error.digest}</p>}
    </div>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <p className="kicker">404</p>
      <h1 className="mt-3 font-display text-5xl font-semibold leading-tight tracking-tight">
        Kode itu tidak ada <em className="font-normal text-kunyit-600">di lembar kami</em>.
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-ink-700">
        Saham yang dicari belum termasuk cakupan data, atau kodenya keliru. Coba cari dari kotak pencarian di atas.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block bg-ink-900 px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-paper hover:bg-ink-700"
      >
        Kembali ke dashboard
      </Link>
    </div>
  );
}

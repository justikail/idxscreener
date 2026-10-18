import Link from "next/link";

import { TextSizeControl } from "@/components/ui/TextSizeControl";

/** Halaman tanpa login: masuk, daftar, tentang. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-ink-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-3" aria-label="Screener Saham ID — beranda">
            <span aria-hidden className="grid h-10 w-10 place-items-center bg-ink-900 font-mono text-sm font-bold text-kunyit-400">
              ID
            </span>
            <span className="font-display text-2xl font-semibold leading-none tracking-tight">
              Screener<span className="font-normal italic text-kunyit-600"> Saham</span>
            </span>
          </Link>
          <span className="flex items-center gap-2 text-xs text-ink-600">
            <span className="hidden sm:inline">Ukuran teks</span>
            <span className="rounded-full bg-ink-900 p-0.5">
              <TextSizeControl />
            </span>
          </span>
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
      <footer className="border-t border-ink-200">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink-600">
          Data harian, bukan realtime. Alat bantu riset, bukan rekomendasi transaksi.{" "}
          <Link href="/tentang" className="underline underline-offset-2">
            Tentang & metodologi
          </Link>
        </div>
      </footer>
    </div>
  );
}

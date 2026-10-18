import Link from "next/link";

import { formatNumber } from "@/lib/format";
import { PAGE_SIZES, pageHref, pageWindow, type PageState, type SearchParamsRecord } from "@/lib/pagination";

/**
 * Navigasi halaman. Murni tautan (tanpa JavaScript), sehingga posisi halaman
 * tersimpan di URL dan bisa dibagikan. `paramKey` berbeda untuk tiap daftar
 * bila satu halaman punya beberapa daftar.
 *
 * Dipasang dua kali per daftar: `top` (jumlah + pilihan baris per halaman,
 * terlihat sebelum menggulir) dan `bottom` (nomor halaman, di ujung daftar).
 */
export function Pagination({
  state,
  path,
  params,
  paramKey,
  defaultSize,
  unit,
  anchor,
  variant,
}: {
  state: PageState<unknown>;
  path: string;
  params: SearchParamsRecord;
  paramKey: string;
  defaultSize: number;
  unit: string;
  anchor?: string;
  variant: "top" | "bottom";
}) {
  const { page, pages, size, total, from, to } = state;
  // Daftar pendek tidak perlu navigasi sama sekali; nomor halaman hanya bila > 1 halaman.
  if (total <= PAGE_SIZES[0]) return null;
  if (variant === "bottom" && pages <= 1) return null;

  const href = (over: { page?: number; size?: number }) =>
    pageHref(path, params, paramKey, { page: over.page ?? page, size: over.size ?? size }, defaultSize, anchor);
  // Ukuran lebih besar dari yang diperlukan untuk menampilkan semuanya tidak ditawarkan.
  const sizes = PAGE_SIZES.filter((s, i) => i === 0 || PAGE_SIZES[i - 1]! < total);

  const range = (
    <span className="kicker">
      {formatNumber(from)}–{formatNumber(to)} dari {formatNumber(total)} {unit}
    </span>
  );

  if (variant === "top") {
    return (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {range}
        <span className="flex items-center gap-1" role="group" aria-label={`Jumlah ${unit} per halaman`}>
          <span className="kicker mr-1">Per halaman:</span>
          {sizes.map((s) =>
            s === size ? (
              <span key={s} aria-current="true" className="num rounded-sm border border-ink-900 px-2 py-0.5 text-xs font-semibold">
                {s}
              </span>
            ) : (
              // Ganti ukuran → kembali ke halaman 1 agar tidak melompat ke posisi aneh.
              <Link key={s} href={href({ page: 1, size: s })} className="num rounded-sm border border-transparent px-2 py-0.5 text-xs text-ink-600 hover:border-ink-300 hover:text-ink-900">
                {s}
              </Link>
            ),
          )}
        </span>
      </div>
    );
  }

  return (
    <nav aria-label={`Halaman ${unit}`} className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-ink-200 pt-3">
      {range}

      <span className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {page > 1 ? (
          <Link href={href({ page: page - 1 })} className="kicker px-2 py-1 hover:text-ink-900" aria-label="Halaman sebelumnya">
            ←
          </Link>
        ) : (
          <span className="kicker px-2 py-1 opacity-40" aria-hidden>
            ←
          </span>
        )}
        {pageWindow(page, pages).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="kicker px-1" aria-hidden>
              …
            </span>
          ) : n === page ? (
            <span key={n} aria-current="page" className="num min-w-8 rounded-sm bg-ink-900 px-2 py-1 text-center text-xs font-semibold text-paper">
              {n}
            </span>
          ) : (
            <Link key={n} href={href({ page: n })} className="num min-w-8 rounded-sm px-2 py-1 text-center text-xs text-ink-600 hover:bg-card hover:text-ink-900">
              {n}
            </Link>
          ),
        )}
        {page < pages ? (
          <Link href={href({ page: page + 1 })} className="kicker px-2 py-1 hover:text-ink-900" aria-label="Halaman berikutnya">
            →
          </Link>
        ) : (
          <span className="kicker px-2 py-1 opacity-40" aria-hidden>
            →
          </span>
        )}
      </span>
    </nav>
  );
}

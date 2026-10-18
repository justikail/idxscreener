"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TextSizeControl } from "@/components/ui/TextSizeControl";

type Sub = { href: string; label: string; exact?: boolean };
type Group = { key: string; label: string; href: string; match: RegExp; icon: React.ReactNode; subs: (path: string) => Sub[] };

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const STOCK_TABS = [
  { seg: "", label: "Ringkasan" },
  { seg: "/teknikal", label: "Teknikal" },
  { seg: "/fundamental", label: "Fundamental" },
  { seg: "/bandarmologi", label: "Bandarmologi" },
];

export function stockCodeFromPath(path: string): string | null {
  const m = path.match(/^\/saham\/([A-Za-z0-9]{1,8})(?:\/|$)/);
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * Tiga menu utama (keputusan client): Kondisi Market, Detail Saham,
 * Rekomendasi — masing-masing dengan sub-menu. Desktop: sidebar kiri.
 * Ponsel: bilah bawah 3 tombol (mudah dijangkau jempol) + sub-menu sebagai
 * tab yang bisa digeser di atas konten.
 */
export function AppShell({
  user,
  strategies,
  signOut,
  children,
}: {
  user: { name: string; isAdmin: boolean };
  signOut: React.ReactNode;
  strategies: Array<{ slug: string; name: string }>;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const groups: Group[] = [
    {
      key: "pasar",
      label: "Kondisi Market",
      href: "/pasar",
      match: /^\/pasar(\/|$)/,
      icon: icon("M4 19V5M4 19h16M8 15l3-4 3 2 5-6"),
      subs: () => [
        { href: "/pasar", label: "Ringkasan", exact: true },
        { href: "/pasar/heatmap", label: "Heatmap" },
        { href: "/pasar/saham", label: "Semua saham" },
        { href: "/pasar/asing", label: "Investor asing" },
      ],
    },
    {
      key: "saham",
      label: "Detail Saham",
      href: "/saham",
      match: /^\/saham(\/|$)/,
      icon: icon("M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4"),
      subs: (p) => {
        const code = stockCodeFromPath(p);
        return code
          ? STOCK_TABS.map((t) => ({ href: `/saham/${code}${t.seg}`, label: t.label, exact: true }))
          : [{ href: "/saham", label: "Cari saham", exact: true }];
      },
    },
    {
      key: "rekomendasi",
      label: "Rekomendasi",
      href: "/rekomendasi",
      match: /^\/rekomendasi(\/|$)/,
      icon: icon("M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"),
      subs: () => [{ href: "/rekomendasi", label: "Semua strategi", exact: true }, ...strategies.map((s) => ({ href: `/rekomendasi/${s.slug}`, label: s.name }))],
    },
  ];
  const active = groups.find((g) => g.match.test(path)) ?? null;
  const subActive = (s: Sub) => (s.exact ? path === s.href : path === s.href || path.startsWith(`${s.href}/`));
  const code = stockCodeFromPath(path);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-ink-900 text-ink-200 lg:flex">
        <Link href="/pasar" className="flex items-center gap-3 px-5 pb-5 pt-6">
          <span aria-hidden className="grid h-10 w-10 place-items-center bg-kunyit-400 font-mono text-sm font-bold text-ink-950">
            ID
          </span>
          <span className="font-display text-xl font-semibold leading-tight text-paper">
            Screener <span className="italic text-kunyit-400">Saham</span>
          </span>
        </Link>
        <nav aria-label="Menu utama" className="flex-1 overflow-y-auto px-3">
          <ul className="flex flex-col gap-1">
            {groups.map((g) => {
              const on = active?.key === g.key;
              return (
                <li key={g.key}>
                  <Link
                    href={g.href}
                    aria-current={on && path === g.href ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.9375rem] font-semibold transition-colors ${
                      on ? "bg-ink-800 text-paper" : "text-ink-300 hover:bg-ink-800 hover:text-paper"
                    }`}
                  >
                    <span className={on ? "text-kunyit-400" : ""}>{g.icon}</span>
                    {g.label}
                  </Link>
                  {on && (
                    <ul className="mb-2 ml-6 mt-1 flex flex-col border-l border-ink-700 pl-3">
                      {g.key === "saham" && code && <li className="px-3 py-1 font-mono text-xs uppercase tracking-widest text-kunyit-300">{code}</li>}
                      {g.subs(path).map((s) => (
                        <li key={s.href}>
                          <Link
                            href={s.href}
                            aria-current={subActive(s) ? "page" : undefined}
                            className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${subActive(s) ? "bg-kunyit-400 font-semibold text-ink-950" : "text-ink-300 hover:text-paper"}`}
                          >
                            {s.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex flex-col gap-3 border-t border-ink-700 px-5 py-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-ink-400">Ukuran teks</span>
            <TextSizeControl />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-ink-200" title={user.name}>
              {user.name}
            </span>
            <span className="flex shrink-0 items-center gap-3 text-xs">
              {user.isAdmin && (
                <Link href="/admin/jobs" className="text-kunyit-300 hover:text-kunyit-200">
                  Admin
                </Link>
              )}
              <Link href="/tentang" className="text-ink-400 hover:text-paper">
                Tentang
              </Link>
              {signOut}
            </span>
          </div>
        </div>
      </aside>

      {/* Bilah atas ponsel */}
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-paper/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/pasar" className="flex items-center gap-2">
            <span aria-hidden className="grid h-8 w-8 place-items-center bg-ink-900 font-mono text-xs font-bold text-kunyit-400">
              ID
            </span>
            <span className="font-semibold">{active?.label ?? "Screener Saham"}</span>
          </Link>
          <span className="flex items-center gap-3">
            <span className="rounded-full bg-ink-900 p-0.5">
              <TextSizeControl />
            </span>
            {user.isAdmin && (
              <Link href="/admin/jobs" className="text-xs font-semibold text-kunyit-700">
                Admin
              </Link>
            )}
            <span className="[&_button]:text-ink-600">{signOut}</span>
          </span>
        </div>
        {active && (
          <nav aria-label={`Sub-menu ${active.label}`} className="relative">
            <ul className="relative flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {active.subs(path).map((s) => (
                <li key={s.href} className="shrink-0">
                  <Link
                    href={s.href}
                    aria-current={subActive(s) ? "page" : undefined}
                    className={`block rounded-full px-3.5 py-1.5 text-sm font-medium ${subActive(s) ? "bg-ink-900 text-paper" : "text-ink-700"}`}
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main id="main-content" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-8">
        {children}
      </main>

      {/* Bilah bawah ponsel: 3 menu utama */}
      <nav aria-label="Menu utama" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-paper pb-[env(safe-area-inset-bottom,0px)] lg:hidden">
        <ul className="grid grid-cols-3">
          {groups.map((g) => {
            const on = active?.key === g.key;
            return (
              <li key={g.key}>
                <Link href={g.href} aria-current={on ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${on ? "text-ink-900" : "text-ink-500"}`}>
                  <span className={`rounded-full px-4 py-1 ${on ? "bg-kunyit-300" : ""}`}>{g.icon}</span>
                  {g.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

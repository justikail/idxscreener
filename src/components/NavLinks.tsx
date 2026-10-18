"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type NavItem = { href: string; label: string };

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

/** Navigasi mendatar — hanya layar md ke atas. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigasi utama" className="-mb-px hidden flex-wrap gap-x-6 gap-y-1 md:flex">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 py-2 font-mono text-[12px] uppercase tracking-[0.16em] transition-colors ${
              active
                ? "border-kunyit-500 text-ink-900"
                : "border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Navigasi ponsel: satu tombol "Menu" yang membuka daftar vertikal di bawah
 * header (bukan deretan tautan mendatar yang terpotong/terlipat). Tertutup
 * otomatis saat pindah halaman, menekan Esc, atau mengetuk di luar.
 */
export function MobileMenu({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const current = items.find((i) => isActive(pathname, i.href));

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 border border-ink-900 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-900"
      >
        <span aria-hidden className="flex w-4 flex-col gap-[3px]">
          <span className={`h-[2px] bg-ink-900 transition-transform ${open ? "translate-y-[5px] rotate-45" : ""}`} />
          <span className={`h-[2px] bg-ink-900 transition-opacity ${open ? "opacity-0" : ""}`} />
          <span className={`h-[2px] bg-ink-900 transition-transform ${open ? "-translate-y-[5px] -rotate-45" : ""}`} />
        </span>
        Menu
      </button>
      <nav
        id={panelId}
        aria-label="Navigasi utama"
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 border-b-2 border-ink-900 bg-paper shadow-[0_16px_32px_-16px_rgba(20,17,12,0.35)]"
      >
        <ul className="mx-auto max-w-6xl px-4 py-2">
          {items.map((item) => {
            const active = item === current;
            return (
              <li key={item.href} className="border-b border-ink-200 last:border-b-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between py-3.5 font-mono text-[13px] uppercase tracking-[0.16em] ${
                    active ? "font-semibold text-ink-900" : "text-ink-600"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${active ? "bg-kunyit-500" : "bg-transparent"}`} />
                    {item.label}
                  </span>
                  <span aria-hidden className="text-ink-400">→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

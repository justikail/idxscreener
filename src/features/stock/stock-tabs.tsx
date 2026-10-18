"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { seg: "", label: "Ringkasan" },
  { seg: "/teknikal", label: "Teknikal" },
  { seg: "/fundamental", label: "Fundamental" },
  { seg: "/bandarmologi", label: "Bandarmologi" },
];

/** Tab detail saham (desktop). Di ponsel, tab yang sama muncul di bilah atas aplikasi. */
export function StockTabs({ code }: { code: string }) {
  const path = usePathname();
  return (
    <nav aria-label={`Bagian detail ${code}`} className="hidden border-b border-ink-300 lg:block">
      <ul className="flex gap-1">
        {TABS.map((t) => {
          const href = `/saham/${code}${t.seg}`;
          const on = path === href;
          return (
            <li key={t.seg}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`-mb-px block border-b-[3px] px-4 py-2.5 text-[0.9375rem] font-semibold transition-colors ${on ? "border-kunyit-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900"}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

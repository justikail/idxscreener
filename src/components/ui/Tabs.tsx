"use client";

import { useId, useState } from "react";

export type TabItem = { id: string; label: string; badge?: string; content: React.ReactNode };

/** Tab dengan pola ARIA standar (panah kiri/kanan berpindah tab). Isi dirender di server. */
export function Tabs({ tabs, label }: { tabs: TabItem[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const base = useId();
  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-4 inline-flex flex-wrap gap-1 rounded-full border border-ink-300 bg-card p-1">
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              id={`${base}-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]!;
                setActive(next.id);
                document.getElementById(`${base}-tab-${next.id}`)?.focus();
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${selected ? "bg-ink-900 text-paper" : "text-ink-700 hover:bg-ink-100"}`}
            >
              {t.label}
              {t.badge && <span className={`ml-1.5 text-xs ${selected ? "text-kunyit-300" : "text-ink-500"}`}>{t.badge}</span>}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`${base}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${t.id}`} hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}

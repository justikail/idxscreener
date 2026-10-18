"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

type Placement = { top: number; left: number; above: boolean; arrow: number };

const GAP = 8;
const MARGIN = 8;

/**
 * Istilah bergaris bawah titik-titik yang membuka penjelasan singkat.
 * Desktop: arahkan kursor atau fokus keyboard. Ponsel: ketuk (ketuk lagi /
 * ketuk di luar / Esc untuk menutup). Popover dirender lewat portal dengan
 * posisi fixed dan dijepit ke viewport supaya tidak terpotong oleh tabel yang
 * bisa digeser atau menimbulkan scroll horizontal.
 *
 * Jangan dipakai di dalam <a>/<button> lain (tombol bersarang tidak valid).
 */
export function Term({ k, children, className = "" }: { k: GlossaryKey; children?: React.ReactNode; className?: string }) {
  const entry = GLOSSARY[k];
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [place, setPlace] = useState<Placement | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = (delay = 0) => {
    clearTimer();
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = useCallback((delay = 0) => {
    clearTimer();
    timer.current = setTimeout(() => {
      setOpen(false);
      setPinned(false);
      setPlace(null);
    }, delay);
  }, []);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const pop = popRef.current;
    if (!trigger || !pop) return;
    const r = trigger.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(center - w / 2, MARGIN), vw - w - MARGIN);
    const fitsBelow = r.bottom + GAP + h <= window.innerHeight - MARGIN;
    const above = !fitsBelow && r.top - GAP - h >= MARGIN;
    setPlace({
      top: above ? r.top - GAP - h : r.bottom + GAP,
      left,
      above,
      arrow: Math.min(Math.max(center - left, 12), w - 12),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hide();
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !popRef.current?.contains(t)) hide();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, hide, reposition]);

  useEffect(() => clearTimer, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onPointerEnter={(e) => e.pointerType === "mouse" && show(120)}
        onPointerLeave={(e) => e.pointerType === "mouse" && !pinned && hide(160)}
        onFocus={() => show()}
        onBlur={() => !pinned && hide(120)}
        onClick={() => {
          if (open && pinned) hide();
          else {
            clearTimer();
            setPinned(true);
            setOpen(true);
          }
        }}
        className={`inline cursor-help text-left [text-transform:inherit] underline decoration-ink-400 decoration-dotted decoration-1 underline-offset-[3px] transition-colors hover:decoration-kunyit-500 focus-visible:decoration-kunyit-500 ${className}`}
      >
        {children ?? entry.label}
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            id={tooltipId}
            role="tooltip"
            onPointerEnter={(e) => e.pointerType === "mouse" && clearTimer()}
            onPointerLeave={(e) => e.pointerType === "mouse" && !pinned && hide(160)}
            style={{ top: place?.top ?? -9999, left: place?.left ?? -9999 }}
            className={`fixed z-50 w-72 max-w-[calc(100vw-16px)] rounded-sm border-t-2 border-kunyit-400 bg-ink-900 px-4 py-3 text-left font-sans text-[13px] normal-case leading-relaxed tracking-normal text-ink-100 shadow-[0_12px_32px_-8px_rgba(20,17,12,0.45)] ${
              place ? "animate-tip-in" : "invisible"
            }`}
          >
            <span
              aria-hidden
              className={`absolute h-2.5 w-2.5 rotate-45 bg-ink-900 ${place?.above ? "-bottom-[5px]" : "-top-[6px] border-l-2 border-t-2 border-kunyit-400"}`}
              style={{ left: (place?.arrow ?? 0) - 5 }}
            />
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-kunyit-300">{entry.label}</span>
              {"full" in entry && entry.full && <span className="text-xs italic text-ink-400">{entry.full}</span>}
            </span>
            <span className="mt-1.5 block text-paper">{entry.meaning}</span>
            {"read" in entry && entry.read && <span className="mt-2 block border-t border-ink-700 pt-2 text-xs text-ink-300">{entry.read}</span>}
          </div>,
          document.body,
        )}
    </>
  );
}

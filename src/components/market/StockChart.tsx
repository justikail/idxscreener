"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

export interface ChartBar {
  time: string; // YYYY-MM-DD (tanggal perdagangan, tanpa konversi zona waktu)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

interface StockChartProps {
  bars: ChartBar[];
  sma20: Array<number | null>;
  sma50: Array<number | null>;
  code: string;
}

const UP = "#0f6b43";
const DOWN = "#c8402a";
const RANGES = [
  { label: "1B", sessions: 21 },
  { label: "3B", sessions: 63 },
  { label: "6B", sessions: 126 },
  { label: "1T", sessions: 252 },
  { label: "Semua", sessions: Infinity },
] as const;

const fmtPrice = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const fmtCompact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M` : n >= 1e6 ? `${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 2 })} jt` : n.toLocaleString("id-ID");
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("id-ID", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
};

export function StockChart({ bars, sma20, sma50, code }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const smaRefs = useRef<{ s20?: ISeriesApi<"Line">; s50?: ISeriesApi<"Line"> }>({});
  const [range, setRange] = useState<(typeof RANGES)[number]["label"]>("6B");
  const [show20, setShow20] = useState(true);
  const [show50, setShow50] = useState(true);
  const [hover, setHover] = useState<ChartBar | null>(null);

  const last = bars[bars.length - 1] ?? null;
  const byTime = useMemo(() => new Map(bars.map((b) => [b.time, b])), [bars]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || bars.length === 0) return;
    const monoFont = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7c705c",
        fontFamily: monoFont,
        fontSize: 11,
      },
      grid: { vertLines: { color: "rgba(23,20,15,0.05)" }, horzLines: { color: "rgba(23,20,15,0.07)" } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#a3967f", labelBackgroundColor: "#17140f" },
        horzLine: { color: "#a3967f", labelBackgroundColor: "#17140f" },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderVisible: false, rightOffset: 4, fixLeftEdge: true },
      localization: { locale: "id-ID", priceFormatter: (p: number) => fmtPrice.format(p) },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineColor: "#17140f",
    });
    candles.setData(bars.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })));

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volume.setData(
      bars
        .filter((b) => b.volume !== null)
        .map((b) => ({ time: b.time as Time, value: b.volume!, color: b.close >= b.open ? "rgba(15,107,67,0.35)" : "rgba(200,64,42,0.35)" })),
    );

    const line = (values: Array<number | null>, color: string) => {
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(bars.flatMap((b, i) => (values[i] != null ? [{ time: b.time as Time, value: values[i]! }] : [])));
      return s;
    };
    smaRefs.current = { s20: line(sma20, "#d38f0f"), s50: line(sma50, "#433b30") };

    chart.subscribeCrosshairMove((param) => {
      const t = param.time as string | undefined;
      setHover(t ? (byTime.get(t) ?? null) : null);
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, sma20, sma50, byTime]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) return;
    const sessions = RANGES.find((r) => r.label === range)!.sessions;
    if (!Number.isFinite(sessions) || sessions >= bars.length) chart.timeScale().fitContent();
    else chart.timeScale().setVisibleLogicalRange({ from: bars.length - sessions, to: bars.length + 3 });
  }, [range, bars.length]);

  useEffect(() => {
    smaRefs.current.s20?.applyOptions({ visible: show20 });
    smaRefs.current.s50?.applyOptions({ visible: show50 });
  }, [show20, show50]);

  const shown = hover ?? last;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-3">
        <div className="num flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600" aria-live="polite">
          {shown ? (
            <>
              <span className="text-ink-900">{fmtDate(shown.time)}</span>
              <span>O <b className="font-medium text-ink-900">{fmtPrice.format(shown.open)}</b></span>
              <span>H <b className="font-medium text-ink-900">{fmtPrice.format(shown.high)}</b></span>
              <span>L <b className="font-medium text-ink-900">{fmtPrice.format(shown.low)}</b></span>
              <span>C <b className={`font-medium ${shown.close >= shown.open ? "text-up-600" : "text-down-500"}`}>{fmtPrice.format(shown.close)}</b></span>
              {shown.volume !== null && <span>Vol <b className="font-medium text-ink-900">{fmtCompact(shown.volume)}</b></span>}
            </>
          ) : (
            <span>—</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex gap-3 text-xs">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={show20} onChange={(e) => setShow20(e.target.checked)} className="accent-kunyit-500" />
              <span className="h-0.5 w-4 bg-kunyit-500" aria-hidden />
              SMA20
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={show50} onChange={(e) => setShow50(e.target.checked)} className="accent-ink-700" />
              <span className="h-0.5 w-4 bg-ink-700" aria-hidden />
              SMA50
            </label>
          </div>
          <div role="group" aria-label="Rentang waktu grafik" className="flex overflow-hidden rounded-sm border border-ink-900">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setRange(r.label)}
                aria-pressed={range === r.label}
                className={`num px-2.5 py-1 text-[11px] transition-colors ${range === r.label ? "bg-ink-900 text-paper" : "text-ink-700 hover:bg-ink-100"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        ref={containerRef}
        role="img"
        aria-label={`Grafik harga ${code}: ${bars.length} sesi dari ${bars[0] ? fmtDate(bars[0].time) : "-"} sampai ${last ? fmtDate(last.time) : "-"}, penutupan terakhir ${last ? fmtPrice.format(last.close) : "-"}`}
        className="mt-3 h-[380px] w-full sm:h-[440px]"
      />
    </div>
  );
}

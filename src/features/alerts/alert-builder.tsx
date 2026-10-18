"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatNumber } from "@/lib/format";

import { createAlert, deleteAlert } from "./actions";
import { ALERT_METRICS, describeAlert, type AlertMetricKey, type ExistingAlert } from "./describe";

const OPS = [
  { id: "lte", text: "turun ke / di bawah" },
  { id: "gte", text: "naik ke / di atas" },
] as const;

/**
 * Pengingat ditulis sebagai kalimat: "Beri tahu saya bila [metrik] [arah] [angka]".
 * Saran cepat dihitung dari nilai terakhir (mis. harga −5%), bukan ramalan.
 */
export function AlertBuilder({
  instrumentCode,
  current,
  existing,
}: {
  instrumentCode: string;
  current: Partial<Record<AlertMetricKey, number>>;
  existing: ExistingAlert[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [metric, setMetric] = useState<AlertMetricKey>("price");
  const [op, setOp] = useState<"lte" | "gte">("lte");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = ALERT_METRICS[metric];
  const cur = current[metric];

  const suggestions: Array<{ label: string; metric: AlertMetricKey; op: "lte" | "gte"; value: number }> = [];
  if (current.price) {
    suggestions.push({ label: "Harga turun 5%", metric: "price", op: "lte", value: Math.round(current.price * 0.95) });
    suggestions.push({ label: "Harga naik 5%", metric: "price", op: "gte", value: Math.round(current.price * 1.05) });
  }
  suggestions.push({ label: "RSI ≤ 30", metric: "rsi14", op: "lte", value: 30 });
  suggestions.push({ label: "RSI ≥ 70", metric: "rsi14", op: "gte", value: 70 });

  const submit = (override?: { metric: AlertMetricKey; op: "lte" | "gte"; value: number }) => {
    const mk = override?.metric ?? metric;
    const o = override?.op ?? op;
    const raw = override?.value ?? Number(value.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(raw)) {
      setMsg({ ok: false, text: "Isi angka batasnya dulu." });
      return;
    }
    setMsg(null);
    start(async () => {
      const r = await createAlert({ instrumentCode, metric: mk, operator: o, threshold: ALERT_METRICS[mk].toStored(raw) });
      if (r.ok) {
        setValue("");
        setMsg({ ok: true, text: `Tersimpan: ${describeAlert({ metric: mk, operator: o, threshold: ALERT_METRICS[mk].toStored(raw) })}.` });
        router.refresh();
      } else setMsg({ ok: false, text: r.error ?? "Gagal menyimpan." });
    });
  };

  return (
    <div className="rounded-md border border-ink-200 bg-card p-4 sm:p-5">
      <h3 className="text-lg font-semibold">Pengingat</h3>
      <p className="mt-1 text-sm text-ink-600">Dicek setiap selesai pembaruan harian (hari kerja, sore). Kabarnya masuk ke halaman Notifikasi.</p>

      <form
        className="mt-4 flex flex-col gap-3 text-[1.0625rem]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="flex flex-wrap items-center gap-2 leading-loose">
          <span>Beri tahu saya bila</span>
          <select
            aria-label="Metrik"
            value={metric}
            onChange={(e) => setMetric(e.target.value as AlertMetricKey)}
            className="rounded-md border border-ink-400 bg-paper px-2 py-1.5 font-semibold"
          >
            {Object.entries(ALERT_METRICS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select aria-label="Arah" value={op} onChange={(e) => setOp(e.target.value as "lte" | "gte")} className="rounded-md border border-ink-400 bg-paper px-2 py-1.5 font-semibold">
            {OPS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.text}
              </option>
            ))}
          </select>
          <span className="inline-flex items-center rounded-md border border-ink-400 bg-paper focus-within:outline focus-within:outline-2 focus-within:outline-kunyit-500">
            {m.unit === "Rp" && <span className="pl-2 text-ink-500">Rp</span>}
            <input
              aria-label="Angka batas"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={cur !== undefined ? formatNumber(m.fromStored(cur), m.digits) : "angka"}
              className="num w-28 bg-transparent px-2 py-1.5 font-semibold outline-none"
            />
            {m.unit && m.unit !== "Rp" && <span className="pr-2 text-ink-500">{m.unit}</span>}
          </span>
        </p>
        <p className="text-sm text-ink-600">
          {cur !== undefined ? (
            <>
              Nilai terakhir: <span className="num font-semibold">{m.unit === "Rp" ? `Rp${formatNumber(cur)}` : `${formatNumber(m.fromStored(cur), m.digits)}${m.unit}`}</span>
            </>
          ) : (
            "Nilai terakhir metrik ini belum tersedia; pengingat baru aktif setelah datanya ada."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-paper hover:bg-ink-700 disabled:opacity-50">
            {pending ? "Menyimpan…" : "Simpan pengingat"}
          </button>
          <span className="text-sm text-ink-500">atau cepat:</span>
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={pending}
              onClick={() => submit(s)}
              className="rounded-full border border-ink-300 px-3 py-1.5 text-sm text-ink-800 hover:border-ink-900 disabled:opacity-50"
              title={describeAlert({ metric: s.metric, operator: s.op, threshold: ALERT_METRICS[s.metric].toStored(s.value) })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p aria-live="polite" className={`min-h-[1.25rem] text-sm ${msg?.ok ? "text-up-700" : "text-down-600"}`}>
          {msg?.text}
        </p>
      </form>

      {existing.length > 0 && (
        <div className="mt-2 border-t border-ink-200 pt-4">
          <p className="mb-2 text-sm font-medium text-ink-700">Pengingat aktif untuk {instrumentCode}</p>
          <AlertList alerts={existing} />
        </div>
      )}
    </div>
  );
}

export function AlertList({ alerts }: { alerts: Array<ExistingAlert & { code?: string }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 rounded-md bg-paper px-3 py-2 text-[0.9375rem]">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span aria-hidden className={`h-2 w-2 rounded-full ${a.isActive ? "bg-up-500" : "bg-ink-300"}`} />
            {a.code && <span className="num font-semibold">{a.code}</span>}
            <span>{describeAlert(a)}</span>
            {!a.isActive && <span className="text-xs text-ink-500">(nonaktif)</span>}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await deleteAlert(a.id);
                router.refresh();
              })
            }
            className="shrink-0 rounded-full px-3 py-1 text-sm text-down-700 hover:bg-down-50 disabled:opacity-50"
          >
            Hapus
          </button>
        </li>
      ))}
    </ul>
  );
}

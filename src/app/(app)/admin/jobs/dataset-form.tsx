"use client";

import { useActionState, useMemo, useState } from "react";

import { updateDatasetSchedule } from "@/features/admin/actions";

export interface DatasetFormProps {
  dataset: string;
  label: string;
  enabled: boolean;
  scope: string;
  codes: string[];
  intervalMinutes: number;
  dailyBudget: number;
  priority: number;
  allowPriced: boolean;
  maxCodes: number;
  minInterval: number;
  maxBudget: number;
  costPerCode: number;
  pricedCount: number;
  usedToday: number;
  status: string;
}

const INTERVAL_PRESETS = [
  { m: 15, t: "15 mnt" },
  { m: 60, t: "1 jam" },
  { m: 180, t: "3 jam" },
  { m: 1440, t: "1 hari" },
  { m: 10080, t: "1 minggu" },
];

function parseCodes(s: string): string[] {
  return [...new Set(s.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))];
}

/**
 * Formulir jadwal satu dataset. Perkiraan request dihitung saat mengetik:
 * kode × biaya per kode × putaran per hari, lalu dibatasi anggaran harian —
 * admin melihat dampaknya terhadap kuota SEBELUM menyimpan.
 */
export function DatasetForm(p: DatasetFormProps) {
  const [state, action, pending] = useActionState(updateDatasetSchedule, null);
  const [enabled, setEnabled] = useState(p.enabled);
  const [scope, setScope] = useState(p.scope);
  const [codes, setCodes] = useState(p.codes.join(", "));
  const [interval, setInterval] = useState(p.intervalMinutes);
  const [budget, setBudget] = useState(p.dailyBudget);

  const list = useMemo(() => parseCodes(codes), [codes]);
  const invalid = list.filter((c) => !/^[A-Z0-9]{1,8}$/.test(c));
  const noCodes = p.maxCodes === 0 && !p.allowPriced;
  const count = noCodes ? 1 : scope === "priced" ? p.pricedCount : list.length;
  // Tiap kode diambil ulang sekali per interval → rata-rata per hari.
  const wanted = Math.ceil((count * p.costPerCode * 1440) / Math.max(interval, 1));
  const perDay = Math.min(wanted, budget);
  const tooMany = scope !== "priced" && p.maxCodes > 0 && list.length > p.maxCodes;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="dataset" value={p.dataset} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{p.label}</h3>
          <p className="num text-xs text-ink-500">
            {p.dataset} · {noCodes ? "1 request per putaran" : `${p.costPerCode} request per kode`} · hari ini {p.usedToday}/{p.dailyBudget}
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-3">
          <span className="text-sm font-medium">{enabled ? "Aktif" : "Nonaktif"}</span>
          <input type="checkbox" name="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="peer sr-only" />
          <span aria-hidden className={`relative h-7 w-12 rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-kunyit-500 ${enabled ? "bg-up-600" : "bg-ink-300"}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-paper shadow transition-all ${enabled ? "left-6" : "left-1"}`} />
          </span>
        </label>
      </div>

      {p.status && <p className="text-sm text-ink-600">{p.status}</p>}

      <div className={`grid gap-4 md:grid-cols-2 ${enabled ? "" : "opacity-70"}`}>
        {noCodes ? (
          <p className="text-sm text-ink-600">Tidak memakai kode saham — satu request per putaran.</p>
        ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink-800">Saham yang diambil</legend>
          {p.allowPriced && (
            <div className="flex gap-2 text-sm">
              {[
                { v: "list", t: "Daftar kode" },
                { v: "priced", t: `Semua saham berharga (${p.pricedCount})` },
              ].map((o) => (
                <label key={o.v} className={`cursor-pointer rounded-full border px-3 py-1.5 ${scope === o.v ? "border-ink-900 bg-ink-900 text-paper" : "border-ink-300"}`}>
                  <input type="radio" name="scope" value={o.v} checked={scope === o.v} onChange={() => setScope(o.v)} className="sr-only" />
                  {o.t}
                </label>
              ))}
            </div>
          )}
          {!p.allowPriced && <input type="hidden" name="scope" value="list" />}
          {p.maxCodes > 0 && scope !== "priced" && (
            <>
              <textarea
                name="codes"
                rows={2}
                value={codes}
                onChange={(e) => setCodes(e.target.value)}
                placeholder="BBCA, TLKM, BBRI"
                className="num rounded-md border border-ink-300 bg-paper px-3 py-2 text-sm uppercase"
              />
              <p className={`text-xs ${tooMany || invalid.length ? "text-down-700" : "text-ink-500"}`}>
                {list.length} kode{p.maxCodes ? ` (maks. ${p.maxCodes})` : ""}
                {invalid.length > 0 && ` · tidak valid: ${invalid.slice(0, 5).join(", ")}`}
                {tooMany && " · terlalu banyak"}
              </p>
            </>
          )}
          {scope === "priced" && <input type="hidden" name="codes" value={codes} />}
        </fieldset>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1 text-sm font-medium text-ink-800">Seberapa sering (min. {p.minInterval} mnt)</p>
            <div className="flex flex-wrap gap-1.5">
              {INTERVAL_PRESETS.filter((x) => x.m >= p.minInterval).map((x) => (
                <button
                  key={x.m}
                  type="button"
                  onClick={() => setInterval(x.m)}
                  aria-pressed={interval === x.m}
                  className={`rounded-full border px-3 py-1 text-sm ${interval === x.m ? "border-ink-900 bg-ink-900 text-paper" : "border-ink-300 hover:border-ink-900"}`}
                >
                  {x.t}
                </button>
              ))}
              <input
                name="intervalMinutes"
                type="number"
                min={p.minInterval}
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                aria-label="Interval dalam menit"
                className="num w-24 rounded-full border border-ink-300 bg-paper px-3 py-1 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="font-medium text-ink-800">Anggaran/hari</span>
              <input
                name="dailyBudget"
                type="number"
                min={0}
                max={p.maxBudget}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="num mt-1 w-full rounded-md border border-ink-300 bg-paper px-3 py-1.5"
              />
              <span className="text-xs text-ink-500">maks. {p.maxBudget}</span>
            </label>
            <label className="text-sm">
              <span className="font-medium text-ink-800">Prioritas</span>
              <input name="priority" type="number" min={0} max={1000} defaultValue={p.priority} className="num mt-1 w-full rounded-md border border-ink-300 bg-paper px-3 py-1.5" />
              <span className="text-xs text-ink-500">angka kecil dikerjakan dulu</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper px-4 py-3">
        <p className="text-sm text-ink-800">
          Perkiraan: <strong className="num">±{perDay} request/hari</strong>
          {wanted > budget && <span className="text-kunyit-800"> (butuh {wanted}, dibatasi anggaran → sisanya dilanjutkan hari berikutnya)</span>}
          {!enabled && <span className="text-ink-500"> · tidak berjalan selama nonaktif</span>}
        </p>
        <div className="flex items-center gap-3">
          {state && (
            <span aria-live="polite" className={`text-sm ${state.ok ? "text-up-700" : "text-down-700"}`}>
              {state.ok ? "✓ Tersimpan" : state.error}
            </span>
          )}
          <button type="submit" disabled={pending || tooMany || invalid.length > 0} className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-paper hover:bg-ink-700 disabled:opacity-40">
            {pending ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </form>
  );
}

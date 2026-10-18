"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import { scheduleCodePermanently } from "@/features/admin/actions";
import { adminRequestAction, updateRequestSettings } from "@/features/requests/actions";

export function RequestSettingsForm(p: { enabled: boolean; dailyBudget: number; perUserDaily: number; maxFollows: number; maxBudget: number; costs: Record<string, number> }) {
  const [state, action, pending] = useActionState(updateRequestSettings, null);
  const [enabled, setEnabled] = useState(p.enabled);
  const [budget, setBudget] = useState(p.dailyBudget);
  const [perUser, setPerUser] = useState(p.perUserDaily);
  const [follows, setFollows] = useState(p.maxFollows);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-md border border-ink-900 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Aturan permintaan pengguna</h3>
          <p className="text-sm text-ink-600">Berlaku untuk semua pengguna yang login.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-3">
          <span className="text-sm font-medium">{enabled ? "Dibuka" : "Ditutup"}</span>
          <input type="checkbox" name="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="peer sr-only" />
          <span aria-hidden className={`relative h-7 w-12 rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-kunyit-500 ${enabled ? "bg-up-600" : "bg-ink-300"}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-paper shadow transition-all ${enabled ? "left-6" : "left-1"}`} />
          </span>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          <span className="font-medium text-ink-800">Anggaran antrean per hari</span>
          <input name="dailyBudget" type="number" min={0} max={p.maxBudget} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="num mt-1 w-full rounded-md border border-ink-300 bg-paper px-3 py-2" />
          <span className="mt-1 block text-xs text-ink-500">
            Request penyedia untuk antrean. Cukup untuk ±{Math.floor(budget / (p.costs.financials || 4))} saham laporan keuangan, atau ±{Math.floor(budget / (p.costs.broker_summary || 1))} saham
            ringkasan broker.
          </span>
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink-800">Jatah per pengguna per hari</span>
          <input name="perUserDaily" type="number" min={0} max={50} value={perUser} onChange={(e) => setPerUser(Number(e.target.value))} className="num mt-1 w-full rounded-md border border-ink-300 bg-paper px-3 py-2" />
          <span className="mt-1 block text-xs text-ink-500">Permintaan BARU. Ikut antre data yang sudah diminta orang lain tidak dihitung.</span>
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink-800">Maks. &ldquo;Pantau lengkap&rdquo; per pengguna</span>
          <input name="maxFollows" type="number" min={0} max={50} value={follows} onChange={(e) => setFollows(Number(e.target.value))} className="num mt-1 w-full rounded-md border border-ink-300 bg-paper px-3 py-2" />
          <span className="mt-1 block text-xs text-ink-500">Tiap saham bisa butuh ±{Object.values(p.costs).reduce((a, b) => a + b, 0)} request sekali segarkan.</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {state && <span className={`text-sm ${state.ok ? "text-up-700" : "text-down-700"}`}>{state.ok ? "✓ Tersimpan" : state.error}</span>}
        <button type="submit" disabled={pending} className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-paper hover:bg-ink-700 disabled:opacity-40">
          {pending ? "Menyimpan…" : "Simpan aturan"}
        </button>
      </div>
    </form>
  );
}

export function RequestRowActions({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: "prioritize" | "cancel" | "retry") =>
    start(async () => {
      setError(null);
      const r = await adminRequestAction(id, action);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {status === "queued" && (
        <>
          <button type="button" disabled={pending} onClick={() => run("prioritize")} className="rounded-full border border-ink-300 px-3 py-1 text-xs font-medium hover:border-ink-900 disabled:opacity-50">
            ↑ Dahulukan
          </button>
          <button type="button" disabled={pending} onClick={() => run("cancel")} className="rounded-full px-3 py-1 text-xs text-down-700 hover:bg-down-50 disabled:opacity-50">
            Batalkan
          </button>
        </>
      )}
      {(status === "failed" || status === "cancelled") && (
        <button type="button" disabled={pending} onClick={() => run("retry")} className="rounded-full border border-ink-300 px-3 py-1 text-xs font-medium hover:border-ink-900 disabled:opacity-50">
          ↻ Ulangi
        </button>
      )}
      {error && <span className="text-xs text-down-700">{error}</span>}
    </span>
  );
}

export function ScheduleButton({ dataset, code }: { dataset: string; code: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await scheduleCodePermanently(dataset, code);
            setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Ditambahkan.") : (r.error ?? "Gagal.") });
            router.refresh();
          })
        }
        className="rounded-full border border-ink-900 px-3 py-1 text-xs font-semibold hover:bg-ink-900 hover:text-paper disabled:opacity-50"
        title="Tambahkan kode ini ke jadwal dataset admin, supaya diperbarui rutin tanpa menunggu permintaan"
      >
        + Jadwalkan permanen
      </button>
      {msg && <span className={`text-xs ${msg.ok ? "text-up-700" : "text-down-700"}`}>{msg.text}</span>}
    </span>
  );
}

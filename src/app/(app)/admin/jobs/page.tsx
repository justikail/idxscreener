import { redirect } from "next/navigation";

import { Pagination } from "@/components/Pagination";
import { Chip, daysBetween, SectionHeader, StatTile } from "@/components/ui/section";
import { SectionNav } from "@/components/ui/SectionNav";
import { auth } from "@/server/auth/config";
import { getDailyStatus, getDataQualityIssues, getIngestionRuns, getMonitoring } from "@/features/admin/actions";
import { DATASET_DEFAULTS, type Dataset } from "@/server/jobs/datasets";
import { DatasetForm } from "./dataset-form";
import { datasetEnabledByFeature, FEATURES } from "@/lib/features";
import { RequestRowActions, RequestSettingsForm, ScheduleButton } from "./request-admin";
import { db } from "@/server/db/client";
import { activeQueue, etaText, getRequestSettings, getUsageToday, popularRequests, recentFinished, USER_DATASET_INFO, USER_DATASETS, costOf, isUserDataset } from "@/server/requests/core";
import { arjumDailyBudget } from "@/server/providers/arjum/config";
import { quotaDateWib } from "@/server/quota/budget";
import { formatDateTimeWib, formatTradingDate } from "@/lib/format";
import { paginate, type SearchParamsRecord } from "@/lib/pagination";
import { RequestDailyUpdateButton } from "./request-update-button";
import { RetryJobButton } from "./retry-button";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: string }> = {
  success: { label: "Berhasil", tone: "bg-up-100 text-up-800" },
  partial: { label: "Sebagian", tone: "bg-kunyit-100 text-kunyit-800" },
  waiting: { label: "Menunggu sesi", tone: "border border-ink-300 text-ink-700" },
  no_session: { label: "Tanpa sesi", tone: "border border-ink-300 text-ink-700" },
  requested: { label: "Diminta", tone: "bg-kunyit-100 text-kunyit-800" },
  running: { label: "Berjalan", tone: "bg-kunyit-200 text-kunyit-900" },
  failed: { label: "Gagal", tone: "bg-down-100 text-down-800" },
  cancelled: { label: "Dibatalkan", tone: "border border-ink-300 text-ink-600" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "bg-ink-100 text-ink-700" };
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.tone}`}>{s.label}</span>;
}

const PER_PAGE = 25;

export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/masuk");
  // Pengecekan di server (bukan hanya menyembunyikan link Admin di nav untuk
  // non-admin) — AGENTS.md §11.
  if (session.user.role !== "admin") redirect("/");

  const [runs, issues, daily, monitoring] = await Promise.all([getIngestionRuns(), getDataQualityIssues(), getDailyStatus(), getMonitoring()]);
  const reqNow = new Date();
  const reqSettings = await getRequestSettings(db);
  const [reqQueue, reqDone, reqPopular, reqUsed] = await Promise.all([
    activeQueue(db, reqNow, reqSettings),
    recentFinished(db, 20),
    popularRequests(db, reqNow, 30, 10),
    getUsageToday(db, reqNow),
  ]);
  const health = monitoring.overview.lastHealth;
  const healthAgeMin = health ? Math.round((Date.now() - health.checkedAt.getTime()) / 60_000) : null;
  // Di hosting (Vercel) job berjalan di GitHub Actions, bukan worker yang hidup terus.
  const externalScheduler = process.env.SCHEDULER === "github-actions";
  const lastRun = runs[0] ?? null;
  const runPage = paginate(runs, params, "run", PER_PAGE);
  const issuePage = paginate(issues, params, "isu", PER_PAGE);

  const today = quotaDateWib();
  const dataAge = daily.coverage.lastSession ? daysBetween(daily.coverage.lastSession, today) : null;
  type Light = { key: string; title: string; ok: boolean | null; headline: string; detail: string };
  const lights: Light[] = [
    {
      key: "api",
      title: "API Pihak Ketiga",
      ok: health ? health.reachable : null,
      headline: !health ? "Belum dicek" : health.reachable ? "Dapat dihubungi" : "Gagal dihubungi",
      detail: health
        ? `${formatDateTimeWib(health.checkedAt)} (±${healthAgeMin} mnt lalu) · HTTP ${health.httpStatus ?? "-"} · ${health.durationMs ?? "-"} ms${health.error ? ` · ${health.error}` : ""}`
        : "Dicek otomatis tiap 3 jam bila jadwal health aktif.",
    },
    { key: "db", title: "Database aplikasi", ok: monitoring.dbOk, headline: monitoring.dbOk ? "Sehat" : "Gagal", detail: `Query uji ${monitoring.dbLatencyMs} ms dari server web.` },
    externalScheduler
      ? { key: "worker", title: "Penjadwal", ok: lastRun !== null, headline: "GitHub Actions", detail: lastRun ? `Aktivitas terakhir ${formatDateTimeWib(lastRun.startedAt)}.` : "Belum ada aktivitas." }
      : {
          key: "worker",
          title: "Worker",
          ok: daily.worker.active,
          headline: daily.worker.active ? "Berjalan" : "Tidak berjalan",
          detail: daily.worker.active && daily.worker.acquiredAt ? `Hidup sejak ${formatDateTimeWib(daily.worker.acquiredAt)}.` : "Periksa layanan worker (systemd) di server.",
        },
    {
      key: "data",
      title: "Kemutakhiran data",
      ok: dataAge === null ? null : dataAge <= 4,
      headline: daily.coverage.lastSession ? formatTradingDate(daily.coverage.lastSession, { weekday: false }) : "Belum ada",
      detail: `${daily.coverage.priced.toLocaleString("id-ID")} saham berharga${dataAge !== null ? ` · sesi terakhir ${dataAge} hari lalu` : ""}.`,
    },
  ];
  const problems = lights.filter((l) => l.ok === false);
  const datasetUse = monitoring.overview.schedules
    .map((sch) => ({ id: sch.dataset, label: DATASET_DEFAULTS[sch.dataset as Dataset]?.label ?? sch.dataset, used: sch.usedDate === today ? sch.usedToday : 0 }))
    .filter((d) => d.used > 0);
  const datasetTotal = datasetUse.reduce((a, d) => a + d.used, 0);
  const coreUsed = Math.max(0, daily.quota.used - datasetTotal);
  const limit = Math.max(daily.quota.limit, 1);
  const remaining = Math.max(0, daily.quota.limit - daily.quota.used);
  const segColors = ["bg-kunyit-500", "bg-up-500", "bg-down-400", "bg-ink-400", "bg-kunyit-300", "bg-up-300", "bg-ink-600"];

  return (
    <div className="flex flex-col gap-10">
      <section className="animate-rise">
        <p className="kicker">Khusus admin</p>
        <h1 className="mt-3 font-display text-5xl font-semibold leading-none tracking-tight">
          Panel <em className="font-normal text-kunyit-600">operasional</em>
        </h1>
        <div
          role="status"
          className={`mt-6 flex items-center gap-4 rounded-md border px-5 py-4 ${problems.length ? "border-down-300 bg-down-50" : "border-up-300 bg-up-50"}`}
        >
          <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg font-bold text-paper ${problems.length ? "bg-down-600" : "bg-up-600"}`}>
            {problems.length ? "!" : "✓"}
          </span>
          <p className="text-[1.0625rem] text-ink-900">
            {problems.length ? (
              <>
                <strong>Perlu perhatian:</strong> {problems.map((p) => `${p.title.toLowerCase()} ${p.headline.toLowerCase()}`).join("; ")}.
              </>
            ) : (
              <>
                <strong>Semua sistem normal.</strong> Kuota hari ini terpakai {daily.quota.used} dari {daily.quota.limit}; sisa {remaining}.
              </>
            )}
          </p>
        </div>
      </section>

      <SectionNav
        label="Bagian panel admin"
        sections={[
          { id: "kesehatan", label: "Kesehatan", hasData: true },
          { id: "kuota", label: "Kuota", hasData: true },
          { id: "harian", label: "Pembaruan harian", hasData: daily.recentRuns.length > 0 },
          { id: "dataset", label: "Dataset tambahan", hasData: monitoring.overview.schedules.some((x) => x.enabled) },
          ...(FEATURES.permintaanData ? [{ id: "permintaan", label: "Permintaan pengguna", hasData: reqQueue.length > 0 }] : []),
          { id: "run", label: "Riwayat run", hasData: runs.length > 0 },
          { id: "isu", label: "Kualitas data", hasData: issues.length > 0 },
        ]}
      />

      <section aria-labelledby="kesehatan" className="scroll-mt-20">
        <SectionHeader id="kesehatan" title="Kesehatan sistem" eyebrow="Empat status terpisah — satu sehat tidak membuktikan yang lain" />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {lights.map((l) => (
            <li key={l.key} className={`rounded-md border bg-card p-4 ${l.ok === false ? "border-down-400" : "border-ink-200"}`}>
              <p className="flex items-center gap-2 text-sm text-ink-600">
                <span
                  aria-hidden
                  className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-paper ${l.ok === null ? "bg-ink-400" : l.ok ? "bg-up-600" : "bg-down-600"}`}
                >
                  {l.ok === null ? "?" : l.ok ? "✓" : "✕"}
                </span>
                {l.title}
              </p>
              <p className="mt-2 text-xl font-semibold">{l.headline}</p>
              <p className="mt-1 text-[0.8125rem] leading-snug text-ink-600">{l.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-500">HTTP 200 dari API tidak membuktikan data hari ini sudah tersedia; lihat &ldquo;Kemutakhiran data&rdquo;.</p>
      </section>

      <section aria-labelledby="kuota" className="scroll-mt-20">
        <SectionHeader
          id="kuota"
          title="Kuota hari ini"
          eyebrow={`Reset 00.00 WIB · tanggal kuota ${formatTradingDate(today, { weekday: false })}`}
          takeaway={
            <>
              Terpakai <strong className="num">{daily.quota.used}</strong> dari <strong className="num">{daily.quota.limit}</strong> request — sisa{" "}
              <strong className="num">{remaining}</strong>.
              {monitoring.quota.providerRemaining !== null && (
                <>
                  {" "}
                  Menurut header Pihak Ketiga sisa <strong className="num">{monitoring.quota.providerRemaining}</strong>/{monitoring.quota.providerLimit ?? "?"}
                  {monitoring.quota.providerObservedAt ? ` (${formatDateTimeWib(monitoring.quota.providerObservedAt)})` : ""}; sisa efektif {monitoring.quota.effectiveRemaining}.
                </>
              )}
            </>
          }
        />
        <div className="rounded-md border border-ink-200 bg-card p-4 sm:p-5">
          <p className="mb-3 text-sm font-medium text-ink-700">Ke mana kuota terpakai</p>
          <div className="flex h-8 overflow-hidden rounded-md bg-ink-100" role="img" aria-label={`Harga harian ${coreUsed}, ${datasetUse.map((d) => `${d.label} ${d.used}`).join(", ")}, sisa ${remaining}`}>
            <span className="h-full bg-ink-900" style={{ width: `${(Math.min(coreUsed, limit) / limit) * 100}%` }} title={`Harga harian & daftar saham: ${coreUsed}`} />
            {datasetUse.map((d, i) => (
              <span key={d.id} className={`h-full border-l-2 border-card ${segColors[i % segColors.length]}`} style={{ width: `${(d.used / limit) * 100}%` }} title={`${d.label}: ${d.used}`} />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-3 w-3 rounded-sm bg-ink-900" /> Harga harian & daftar saham <span className="num font-semibold">{coreUsed}</span>
            </li>
            {datasetUse.map((d, i) => (
              <li key={d.id} className="flex items-center gap-2">
                <span aria-hidden className={`h-3 w-3 rounded-sm ${segColors[i % segColors.length]}`} /> {d.label} <span className="num font-semibold">{d.used}</span>
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-3 w-3 rounded-sm border border-ink-300 bg-ink-100" /> Sisa <span className="num font-semibold">{remaining}</span>
            </li>
          </ul>
          {monitoring.budgetClamped && (
            <p className="mt-3 text-sm text-down-700">ARJUM_DAILY_BUDGET di environment melebihi ARJUM_ACCOUNT_QUOTA; aplikasi memotongnya menjadi {monitoring.quota.limit}.</p>
          )}
          <p className="mt-3 text-xs text-ink-500">Key terkonfigurasi: {monitoring.keyCount}. Nilai key tidak pernah ditampilkan.</p>
        </div>
      </section>

      <section aria-labelledby="harian" className="scroll-mt-20">
        <SectionHeader id="harian" title="Pembaruan harian otomatis" eyebrow="Hari kerja · mulai 17.00 WIB · ulang tiap jam, maks. 5×" />
        <dl className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Cakupan data"
            value={
              <>
                {daily.coverage.priced.toLocaleString("id-ID")}
                <span className="text-base font-normal text-ink-500"> / {daily.coverage.total.toLocaleString("id-ID")}</span>
              </>
            }
            sub={
              daily.coverage.total - daily.coverage.priced > 0
                ? `${(daily.coverage.total - daily.coverage.priced).toLocaleString("id-ID")} saham menunggu backfill dari sisa kuota.`
                : "Semua saham sudah punya harga."
            }
          />
          <StatTile
            label="Jadwal saat ini"
            value={daily.decision.action === "run" ? "Siap jalan" : "Menunggu"}
            sub={daily.decision.action === "run" ? `Percobaan ke-${daily.decision.attempt} pada menit berikutnya.` : daily.decision.reason}
          />
          <div className="flex flex-col justify-between gap-3 rounded-md border border-ink-200 bg-card p-4">
            <p className="text-sm text-ink-600">Ambil ulang semua saham sekarang tanpa menunggu jadwal, lalu hitung indikator.</p>
            <RequestDailyUpdateButton externalScheduler={externalScheduler} />
          </div>
        </dl>
        <ol className="mt-5 flex flex-col gap-2">
          {daily.recentRuns.map((run) => (
            <li key={run.id} className="grid gap-1 rounded-md border border-ink-200 bg-card px-4 py-3 text-sm sm:grid-cols-[11rem_9rem_1fr] sm:items-center sm:gap-4">
              <span className="num text-xs text-ink-500">{formatDateTimeWib(run.startedAt)}</span>
              <span className="flex flex-wrap items-center gap-2">
                <StatusPill status={run.status} />
                {run.batchId.endsWith("-manual") && <span className="text-xs text-ink-500">manual</span>}
              </span>
              <span className="min-w-0">
                {run.note && <span className="block text-ink-800">{run.note}</span>}
                {run.error && <span className="block break-words text-xs text-down-700">{run.error}</span>}
                {!run.note && !run.error && <span className="text-ink-400">—</span>}
              </span>
            </li>
          ))}
          {daily.recentRuns.length === 0 && <li className="text-sm text-ink-500">Belum pernah dijalankan.</li>}
        </ol>
      </section>

      <section aria-labelledby="dataset" className="scroll-mt-20">
        <SectionHeader
          id="dataset"
          title="Dataset tambahan"
          eyebrow={`Harga harian memakai ±${daily.coverage.priced} request — sisanya untuk dataset ini`}
          takeaway="Dikerjakan worker setelah pembaruan harian. Kode yang paling lama tidak diperbarui didahulukan; bila kuota habis, dilanjutkan pada kesempatan berikutnya."
        />
        <ul className="flex flex-col gap-3">
          {monitoring.overview.schedules.map((sch) => {
            const ds = sch.dataset as Dataset;
            const lim = monitoring.limits[ds];
            const st = monitoring.overview.states.get(sch.dataset);
            if (!lim || !DATASET_DEFAULTS[ds]) return null;
            if (!datasetEnabledByFeature(ds))
              return (
                <li key={sch.dataset} className="rounded-md border border-dashed border-ink-300 bg-card/50 px-4 py-3 text-sm text-ink-600">
                  <strong>{DATASET_DEFAULTS[ds].label}</strong> — fiturnya sedang dinonaktifkan (src/lib/features.ts), jadi data ini tidak diambil.
                </li>
              );
            return (
              <li key={sch.dataset} className={`rounded-md border bg-card p-4 sm:p-5 ${sch.enabled ? "border-ink-900" : "border-ink-200"}`}>
                <DatasetForm
                  dataset={sch.dataset}
                  label={DATASET_DEFAULTS[ds].label}
                  enabled={sch.enabled}
                  scope={sch.scope}
                  codes={sch.codes}
                  intervalMinutes={sch.intervalMinutes}
                  dailyBudget={sch.dailyBudget}
                  priority={sch.priority}
                  allowPriced={lim.allowPriced}
                  maxCodes={lim.maxCodes}
                  minInterval={lim.minInterval}
                  maxBudget={lim.maxBudget}
                  costPerCode={DATASET_DEFAULTS[ds].costPerCode}
                  pricedCount={daily.coverage.priced}
                  usedToday={sch.usedDate === today ? sch.usedToday : 0}
                  status={[st ? `${st.ok} kode sukses, ${st.failed} gagal` : null, sch.lastNote ? `terakhir: ${sch.lastNote}` : null].filter(Boolean).join(" · ")}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {/* Riwayat run */}
      {FEATURES.permintaanData && (
      <section aria-labelledby="permintaan" className="scroll-mt-20">
        <SectionHeader
          id="permintaan"
          title="Permintaan pengguna"
          eyebrow="Antrean bersama · dikerjakan setelah harga harian dan jadwal di atas"
          takeaway={
            <>
              {reqQueue.length} permintaan menunggu. Hari ini terpakai <strong className="num">{reqUsed}</strong> dari anggaran{" "}
              <strong className="num">{reqSettings.dailyBudget}</strong> request.{" "}
              {!reqSettings.enabled && <strong className="text-down-700">Permintaan baru sedang ditutup.</strong>}
            </>
          }
          chips={reqSettings.enabled ? <Chip tone="good" icon="✓">Dibuka</Chip> : <Chip tone="bad" icon="✕">Ditutup</Chip>}
        />

        <details className="group mb-4 rounded-md border border-ink-200 bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
            Cara kerja (untuk admin)
            <span aria-hidden className="font-mono text-xs text-ink-400 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="grid gap-3 border-t border-ink-200 p-4 text-[0.9375rem] leading-relaxed text-ink-800 sm:grid-cols-3">
            <p>
              <strong className="block">1 · Urutan kuota</strong>
              Setiap sore worker mengerjakan: (1) harga harian semua saham, (2) jadwal dataset di atas, (3) antrean ini — dibatasi anggaran antrean per hari
              dan sisa kuota.
            </p>
            <p>
              <strong className="block">2 · Hemat otomatis</strong>
              Data yang masih segar tidak diminta ulang. Satu data × saham hanya diambil sekali walau diminta banyak orang; peminta lain ikut antre tanpa
              memakai jatahnya.
            </p>
            <p>
              <strong className="block">3 · Tugas admin</strong>
              Atur anggaran &amp; jatah, dahulukan atau batalkan antrean, dan pindahkan saham yang sering diminta ke jadwal permanen. Antrean gagal 3× ditandai
              gagal dan peminta diberi tahu.
            </p>
          </div>
        </details>

        <RequestSettingsForm
          enabled={reqSettings.enabled}
          dailyBudget={reqSettings.dailyBudget}
          perUserDaily={reqSettings.perUserDaily}
          maxFollows={reqSettings.maxFollows}
          maxBudget={arjumDailyBudget()}
          costs={Object.fromEntries(USER_DATASETS.map((d) => [d, costOf(d)]))}
        />

        <h3 className="mb-2 mt-6 text-lg font-semibold">Antrean ({reqQueue.length})</h3>
        {reqQueue.length === 0 ? (
          <p className="text-[0.9375rem] text-ink-600">Antrean kosong.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-ink-200 bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-ink-600">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Saham · data</th>
                  <th className="px-3 py-2 font-medium">Sumber</th>
                  <th className="px-3 py-2 text-right font-medium">Peminta</th>
                  <th className="px-3 py-2 font-medium">Perkiraan</th>
                  <th className="px-4 py-2 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {reqQueue.slice(0, 50).map((q) => (
                  <tr key={q.id} className="border-b border-ink-100 last:border-0">
                    <td className="num px-4 py-2">{q.status === "running" ? "↻" : q.position}</td>
                    <td className="px-3 py-2">
                      <span className="num font-bold">{q.code}</span> {USER_DATASET_INFO[q.dataset].label}
                      {q.priority > 0 && <span className="ml-2 text-xs text-kunyit-800">prioritas +{q.priority}</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-600">{q.source === "follow" ? "Pantau lengkap" : "Tombol minta"}</td>
                    <td className="num px-3 py-2 text-right">{q.requesters}</td>
                    <td className="px-3 py-2 text-ink-700">{q.status === "running" ? "sedang diambil" : etaText(q.etaDay)}</td>
                    <td className="px-4 py-2">
                      <RequestRowActions id={q.id} status={q.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-lg font-semibold">Paling banyak diminta · 30 hari</h3>
            {reqPopular.length === 0 ? (
              <p className="text-[0.9375rem] text-ink-600">Belum ada data.</p>
            ) : (
              <ul className="overflow-hidden rounded-md border border-ink-200 bg-card">
                {reqPopular.map((p) => (
                  <li key={`${p.code}-${p.dataset}`} className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-2 last:border-0">
                    <span className="text-sm">
                      <span className="num font-bold">{p.code}</span> {p.label} · <span className="text-ink-600">{p.requesters} peminta</span>
                    </span>
                    {isUserDataset(p.dataset) && <ScheduleButton dataset={p.dataset} code={p.code} />}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-lg font-semibold">Baru selesai</h3>
            {reqDone.length === 0 ? (
              <p className="text-[0.9375rem] text-ink-600">Belum ada.</p>
            ) : (
              <ul className="overflow-hidden rounded-md border border-ink-200 bg-card">
                {reqDone.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-2 text-sm last:border-0">
                    <span className="min-w-0">
                      <span className="num font-bold">{r.code}</span> {isUserDataset(r.dataset) ? USER_DATASET_INFO[r.dataset].label : r.dataset} ·{" "}
                      <StatusPill status={r.status === "done" ? "success" : r.status} />
                      {r.lastError && r.status === "failed" && <span className="block break-words text-xs text-down-700">{r.lastError}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="num text-xs text-ink-500">{r.finishedAt ? formatDateTimeWib(r.finishedAt) : "—"}</span>
                      <RequestRowActions id={r.id} status={r.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
      )}

      <section aria-labelledby="run" className="scroll-mt-20">
        <SectionHeader id="run" title="Riwayat semua run" action={<RetryJobButton />} />
        <Pagination variant="top" state={runPage} path="/admin/jobs" params={params} paramKey="run" defaultSize={PER_PAGE} unit="run" anchor="run" />
        {/* Ponsel: kartu vertikal, tidak ada kolom yang harus digeser. */}
        <ul className="divide-y divide-ink-200 md:hidden">
          {runPage.items.map((run) => (
            <li key={run.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={run.status} />
                <span className="num text-xs">{run.capability}</span>
                <span className="num text-xs text-ink-500">· {run.provider}</span>
              </div>
              <p className="num mt-1 text-xs text-ink-500">
                {formatDateTimeWib(run.startedAt)}
                {run.finishedAt ? ` → ${formatDateTimeWib(run.finishedAt)}` : ""}
              </p>
              {run.note && <p className="mt-1 text-ink-700">{run.note}</p>}
              {run.error && <p className="mt-1 break-words text-xs text-down-600">{run.error}</p>}
            </li>
          ))}
          {runs.length === 0 && <li className="py-4 text-sm text-ink-500">Belum ada riwayat run.</li>}
        </ul>
        <div className="relative hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="kicker border-b border-ink-300 text-left">
                <th className="py-3 pr-4 font-normal">Penyedia</th>
                <th className="py-3 pr-4 font-normal">Jenis</th>
                <th className="py-3 pr-4 font-normal">Status</th>
                <th className="py-3 pr-4 font-normal">Mulai</th>
                <th className="py-3 pr-4 font-normal">Selesai</th>
                <th className="py-3 font-normal">Catatan / error</th>
              </tr>
            </thead>
            <tbody>
              {runPage.items.map((run) => (
                <tr key={run.id} className="border-b border-ink-200 align-top">
                  <td className="num py-2.5 pr-4">{run.provider}</td>
                  <td className="num py-2.5 pr-4 text-xs">{run.capability}</td>
                  <td className="py-2.5 pr-4"><StatusPill status={run.status} /></td>
                  <td className="num whitespace-nowrap py-2.5 pr-4 text-xs text-ink-500">{formatDateTimeWib(run.startedAt)}</td>
                  <td className="num whitespace-nowrap py-2.5 pr-4 text-xs text-ink-500">{run.finishedAt ? formatDateTimeWib(run.finishedAt) : "—"}</td>
                  <td className="py-2.5 text-xs">
                    {run.note && <span className="block text-ink-700">{run.note}</span>}
                    {run.error && <span className="block break-words text-down-600">{run.error}</span>}
                    {!run.note && !run.error && <span className="text-ink-400">—</span>}
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-ink-500">Belum ada riwayat run.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination variant="bottom" state={runPage} path="/admin/jobs" params={params} paramKey="run" defaultSize={PER_PAGE} unit="run" anchor="run" />
      </section>

      <section aria-labelledby="isu" className="scroll-mt-20">
        <SectionHeader id="isu" title="Masalah kualitas data" chips={issues.length ? <Chip tone="warn">{issues.length} isu</Chip> : <Chip tone="good" icon="✓">Tidak ada isu</Chip>} />
        <Pagination variant="top" state={issuePage} path="/admin/jobs" params={params} paramKey="isu" defaultSize={PER_PAGE} unit="isu" anchor="isu" />
        <ul className="divide-y divide-ink-200">
          {issuePage.items.map((issue) => (
            <li key={issue.id} className="flex gap-3 py-2.5 text-sm">
              <span
                className={`h-fit shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                  issue.severity === "error" ? "bg-down-100 text-down-800" : "bg-ink-100 text-ink-700"
                }`}
              >
                {issue.severity}
              </span>
              <span className="min-w-0 break-words">{issue.message}</span>
            </li>
          ))}
          {issues.length === 0 && <li className="py-3 text-sm text-ink-500">Tidak ada isu tercatat.</li>}
        </ul>
        <Pagination variant="bottom" state={issuePage} path="/admin/jobs" params={params} paramKey="isu" defaultSize={PER_PAGE} unit="isu" anchor="isu" />
      </section>
    </div>
  );
}

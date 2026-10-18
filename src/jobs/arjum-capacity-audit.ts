import "@/server/load-env";

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import postgres from "postgres";

import {
  AuditBudget,
  AuditBudgetExhaustedError,
  extensionSteps,
  extractFacts,
  marketCapCodes,
  newCheckpoint,
  nextStep,
  scheduleMarketCapPages,
  summarizeInstruments,
  toNum,
  type AuditCheckpoint,
  type ManifestEntry,
} from "@/server/audit/arjum-capacity";
import { arjumGet, type ArjumAttemptLog } from "@/server/providers/arjum/client";
import { arjumApiKey } from "@/server/providers/arjum/config";
import { ArjumAuthError, ArjumClientError, ArjumMissingKeyError } from "@/server/providers/arjum/errors";

/**
 * Audit kapasitas Arjum — resumable, hard budget, satu key, tanpa menulis ke
 * database aplikasi (DB hanya DIBACA untuk tanggal sesi terakhir).
 *
 *   pnpm audit:arjum                 dry-run: tampilkan rencana, 0 panggilan HTTP
 *   pnpm audit:arjum -- --live       jalankan (opt-in), lanjut dari checkpoint
 *   opsi: --budget=N (default ARJUM_AUDIT_BUDGET atau 100, kumulatif lintas resume)
 *         --dir=docs/arjum-audit     lokasi checkpoint.json + manifest.jsonl
 *         --session=YYYY-MM-DD       tanggal sesi sampel (default: sesi terakhir di DB)
 *         --fresh                    abaikan checkpoint lama
 *
 * Key: ARJUM_AUDIT_KEY, atau key PERTAMA dari ARJUM_API_KEYS. Tidak ada rotasi
 * key. Nilai key tidak pernah ditulis ke manifest/log.
 */

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
}

async function lastSessionFromDb(): Promise<string | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const [row] = await sql`select max(trading_date)::text as d from daily_bars where source = 'arjum'`;
    return (row?.d as string | null) ?? null;
  } finally {
    await sql.end();
  }
}

function pickKey(): { key: string; label: string } {
  const dedicated = process.env.ARJUM_AUDIT_KEY?.trim();
  if (dedicated) return { key: dedicated, label: "audit-key" };
  const key = arjumApiKey();
  if (!key) throw new ArjumMissingKeyError();
  return { key, label: "key#1" };
}

async function main() {
  const live = arg("live") === "true";
  const dir = arg("dir") ?? "docs/arjum-audit";
  const budgetLimit = Number(arg("budget") ?? process.env.ARJUM_AUDIT_BUDGET ?? "100");
  const cpPath = path.join(dir, "checkpoint.json");
  const manifestPath = path.join(dir, "manifest.jsonl");

  const session = arg("session") ?? (await lastSessionFromDb());
  if (!session || !/^\d{4}-\d{2}-\d{2}$/.test(session)) throw new Error("Tanggal sesi tidak diketahui; beri --session=YYYY-MM-DD.");

  let cp: AuditCheckpoint;
  if (existsSync(cpPath) && arg("fresh") !== "true") {
    cp = JSON.parse(readFileSync(cpPath, "utf8")) as AuditCheckpoint;
  } else {
    cp = newCheckpoint(session, process.env.ARJUM_AUDIT_KEY ? "audit-key" : "key#1");
  }
  for (const step of extensionSteps()) if (!cp.pending.some((s) => s.id === step.id)) cp.pending.push(step);
  const budget = new AuditBudget(budgetLimit, cp.httpCallsUsed);
  const remainingSteps = cp.pending.filter((s) => !cp.done[s.id]);

  console.log(`Sesi sampel: ${cp.sessionDate} · checkpoint: ${existsSync(cpPath) ? "dilanjutkan" : "baru"}`);
  console.log(`Budget HTTP: ${budget.used}/${budget.limit} terpakai · langkah tersisa: ${remainingSteps.length}` +
    (cp.done["market-cap:p1"] ? "" : " (+ halaman market-cap 2..N setelah halaman 1)"));

  if (!live) {
    console.log("\nDRY-RUN — tidak ada panggilan HTTP. Rencana:");
    for (const s of remainingSteps) console.log(`  ${s.id.padEnd(34)} GET ${s.path} ${new URLSearchParams(s.params)}  — ${s.purpose}`);
    console.log("\nJalankan dengan --live untuk mengeksekusi (opt-in).");
    return;
  }

  mkdirSync(dir, { recursive: true });
  const { key, label } = pickKey();
  cp.keyLabel = label;
  const save = () => {
    cp.httpCallsUsed = budget.used;
    writeFileSync(cpPath, JSON.stringify(cp, null, 2));
  };

  for (let step = nextStep(cp); step; step = nextStep(cp)) {
    const attempts: ArjumAttemptLog[] = [];
    const entry: ManifestEntry = {
      at: new Date().toISOString(),
      stepId: step.id,
      path: step.path,
      params: step.params,
      httpStatus: null,
      outcome: "ok",
      attempts: 0,
      durationMs: null,
      rowCount: null,
      pagination: null,
      rateLimit: { limit: null, remaining: null },
      quotaCost: null,
    };
    let facts: Record<string, unknown>;
    try {
      const res = await arjumGet(
        {
          apiKey: () => ({ key, label }),
          reserve: async () => budget.consume(),
          maxAttempts: 2,
          timeoutMs: 30_000,
          onAttempt: (a) => attempts.push(a),
        },
        step.path,
        step.params,
      );
      facts = extractFacts(res.body);
      entry.httpStatus = res.httpStatus;
      entry.durationMs = res.durationMs;
      entry.rowCount = toNum(facts.rowCount);
      entry.pagination =
        "total" in facts || "total_pages" in facts
          ? { total: toNum(facts.total), page: toNum(facts.page), perPage: toNum(facts.per_page), totalPages: toNum(facts.total_pages) }
          : null;
      entry.rateLimit = { limit: toNum(res.responseHeaders["x-ratelimit-limit"]), remaining: toNum(res.responseHeaders["x-ratelimit-remaining"]) };
      if (entry.rateLimit.remaining !== null) {
        // Biaya = penurunan "remaining" sejak panggilan sebelumnya pada key yang sama.
        // Tercemar bila proses lain memakai key yang sama di sela-sela.
        entry.quotaCost = cp.lastRemaining !== null ? cp.lastRemaining - entry.rateLimit.remaining : null;
        cp.lastRemaining = entry.rateLimit.remaining;
      }
      if (/^market-cap:/.test(step.id)) {
        cp.marketCapCodes[step.id] = marketCapCodes(res.body);
        if (step.id === "market-cap:p1") scheduleMarketCapPages(cp, toNum(facts.total_pages) ?? 1);
      }
    } catch (error) {
      if (error instanceof AuditBudgetExhaustedError) {
        save();
        const left = cp.pending.filter((s) => !cp.done[s.id]);
        console.log(`\nBERHENTI: ${error.message} Sisa ${left.length} langkah: ${left.map((s) => s.id).join(", ")}`);
        console.log("Lanjutkan dengan --live --budget=<lebih besar>; checkpoint tersimpan.");
        return;
      }
      entry.outcome = "error";
      entry.httpStatus = error instanceof ArjumClientError || error instanceof ArjumAuthError ? error.httpStatus : (attempts.at(-1)?.httpStatus ?? null);
      entry.error = `${error instanceof Error ? error.name : "Error"}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300);
      facts = { error: entry.error };
      if (error instanceof ArjumAuthError) {
        appendFileSync(manifestPath, JSON.stringify({ ...entry, attempts: attempts.length }) + "\n");
        cp.done[step.id] = { facts, manifestIndex: -1 };
        save();
        console.log("\nBERHENTI: autentikasi ditolak (401/403). Tidak diulang.");
        return;
      }
    }
    entry.attempts = attempts.length;
    appendFileSync(manifestPath, JSON.stringify(entry) + "\n");
    cp.done[step.id] = { facts, manifestIndex: Object.keys(cp.done).length };
    save();
    console.log(
      `${step.id.padEnd(34)} ${String(entry.httpStatus ?? "-").padEnd(4)} rows=${entry.rowCount ?? "-"} ` +
        `remaining=${entry.rateLimit.remaining ?? "-"} cost=${entry.quotaCost ?? "?"} ${entry.durationMs ?? "-"}ms${entry.error ? ` ${entry.error.slice(0, 80)}` : ""}`,
    );
  }

  const inst = summarizeInstruments(cp);
  console.log(`\nSELESAI. HTTP terpakai ${budget.used}/${budget.limit}. Instrumen: ${inst.unique} unik dari ${inst.rows} baris, metadata total ${inst.metadataTotal}, duplikat ${inst.duplicates.length}.`);
}

main().catch((error) => {
  console.error("Audit gagal:", error instanceof Error ? error.message : error);
  process.exit(1);
});

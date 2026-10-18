import { evaluateFilter, type FilterField } from "@/domain/filter-ast";
import { FIELD_META, strategyFilter, type StrategyVariant } from "@/domain/strategies";
import type { ScreenerCandidateRow } from "@/server/db/queries";

export interface VariantResult {
  passed: Array<{ code: string; name: string; price: number | null; values: Record<string, number | string | null> }>;
  testable: number;
  untestable: number;
  /** Data apa yang paling sering kurang (label, jumlah saham). */
  missing: Array<{ field: FilterField; label: string; count: number }>;
  asOf: string | null;
}

/**
 * Evaluasi satu varian strategi terhadap semua kandidat. Data kosong tidak
 * pernah dianggap lolos: saham itu masuk "belum bisa diuji".
 */
export function evaluateVariant(candidates: ScreenerCandidateRow[], variant: StrategyVariant): VariantResult {
  const filter = strategyFilter(variant);
  const passed: VariantResult["passed"] = [];
  let testable = 0;
  const missing = new Map<FilterField, number>();
  for (const c of candidates) {
    if (typeof c.values.price !== "number") continue;
    const r = evaluateFilter(filter, { instrumentId: c.instrumentId, values: c.values });
    if (r.missingFields.length > 0 && !r.passed) {
      for (const f of r.missingFields) missing.set(f, (missing.get(f) ?? 0) + 1);
      continue;
    }
    testable += 1;
    if (r.passed) passed.push({ code: c.code, name: c.name, price: c.values.price as number, values: c.values });
  }
  const { field, dir } = variant.sort;
  passed.sort((a, b) => {
    const x = typeof a.values[field] === "number" ? (a.values[field] as number) : -Infinity;
    const y = typeof b.values[field] === "number" ? (b.values[field] as number) : -Infinity;
    return dir === "desc" ? y - x : x - y;
  });
  const priced = candidates.filter((c) => typeof c.values.price === "number").length;
  return {
    passed,
    testable,
    untestable: priced - testable,
    missing: [...missing.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => ({ field: f, label: FIELD_META[f]?.label ?? f, count: n })),
    asOf: candidates.map((c) => c.asOf).filter(Boolean).sort().at(-1) ?? null,
  };
}

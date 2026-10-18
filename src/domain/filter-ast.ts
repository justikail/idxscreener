import { z } from "zod";

// Typed filter AST untuk screener. Field dan operator memakai allowlist eksplisit
// (bukan string bebas dari pengguna) sehingga kompilasi ke query terparameterisasi
// aman dari injection. Lihat AGENTS.md §9.

export const FILTER_FIELDS = [
  "price",
  "per",
  "pbv",
  "roe",
  "roa",
  "npm",
  "der",
  "rsi14",
  "volume_relative_20d",
  "market_cap",
  "foreign_net_ratio_5d",
  "change_1d",
  "return_5d",
  "return_20d",
  "close_position",
  "value_avg_20d",
  "close_vs_sma20",
  "close_vs_sma50",
  "sma20_vs_sma50",
  "range_position_52w",
  "net_income_growth_yoy",
  "revenue_growth_yoy",
  "broker_top3_net_ratio",
  "sector_code",
  "is_bank",
] as const;

export type FilterField = (typeof FILTER_FIELDS)[number];

const numericFields = new Set<FilterField>([
  "price",
  "per",
  "pbv",
  "roe",
  "roa",
  "npm",
  "der",
  "rsi14",
  "volume_relative_20d",
  "market_cap",
  "foreign_net_ratio_5d",
  "change_1d",
  "return_5d",
  "return_20d",
  "close_position",
  "value_avg_20d",
  "close_vs_sma20",
  "close_vs_sma50",
  "sma20_vs_sma50",
  "range_position_52w",
  "net_income_growth_yoy",
  "revenue_growth_yoy",
  "broker_top3_net_ratio",
]);

export const NUMERIC_OPERATORS = ["gt", "gte", "lt", "lte", "eq"] as const;
export type NumericOperator = (typeof NUMERIC_OPERATORS)[number];

export const CATEGORICAL_OPERATORS = ["eq", "in"] as const;
export type CategoricalOperator = (typeof CATEGORICAL_OPERATORS)[number];

export type FilterOperator = NumericOperator | CategoricalOperator;

export interface FilterCondition {
  type: "condition";
  field: FilterField;
  operator: FilterOperator;
  value: number | string | string[];
  /** Jika true, kandidat dengan nilai unknown/null TIDAK otomatis gagal ataupun lolos
   * — ia dikeluarkan dari hasil "lolos" tapi dicatat di missingFields, kecuali
   * requireAvailable eksplisit di level query. */
}

export interface FilterGroup {
  type: "group";
  operator: "and" | "or";
  children: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

export const filterConditionSchema: z.ZodType<FilterCondition> = z.object({
  type: z.literal("condition"),
  field: z.enum(FILTER_FIELDS),
  operator: z.enum([...NUMERIC_OPERATORS, ...CATEGORICAL_OPERATORS]),
  value: z.union([z.number(), z.string(), z.array(z.string())]),
});

export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    operator: z.enum(["and", "or"]),
    children: z.array(filterNodeSchema).min(1).max(20),
  }),
);

export const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([filterConditionSchema, filterGroupSchema]),
);

export class FilterValidationError extends Error {}

/** Memvalidasi bahwa operator sesuai tipe field dan struktur tidak melebihi batas kompleksitas. */
export function validateFilterNode(node: FilterNode, depth = 0): void {
  if (depth > 6) {
    throw new FilterValidationError("Filter terlalu dalam (maksimum 6 level nested group).");
  }

  if (node.type === "condition") {
    const isNumeric = numericFields.has(node.field);
    if (isNumeric) {
      if (!NUMERIC_OPERATORS.includes(node.operator as NumericOperator)) {
        throw new FilterValidationError(
          `Operator "${node.operator}" tidak valid untuk field numerik "${node.field}".`,
        );
      }
      if (typeof node.value !== "number" || Number.isNaN(node.value)) {
        throw new FilterValidationError(`Nilai untuk field "${node.field}" harus angka.`);
      }
    } else {
      if (!CATEGORICAL_OPERATORS.includes(node.operator as CategoricalOperator)) {
        throw new FilterValidationError(
          `Operator "${node.operator}" tidak valid untuk field kategorikal "${node.field}".`,
        );
      }
      if (node.operator === "in" && !Array.isArray(node.value)) {
        throw new FilterValidationError('Operator "in" membutuhkan nilai berupa array.');
      }
    }
    return;
  }

  for (const child of node.children) {
    validateFilterNode(child, depth + 1);
  }
}

export interface CandidateMetrics {
  instrumentId: string;
  values: Partial<Record<FilterField, number | string | null>>;
}

export interface ConditionEvaluation {
  field: FilterField;
  operator: FilterOperator;
  threshold: number | string | string[];
  actual: number | string | null;
  met: boolean | "unknown";
}

export interface EvaluationResult {
  passed: boolean;
  reasons: ConditionEvaluation[];
  missingFields: FilterField[];
}

function evaluateCondition(
  condition: FilterCondition,
  values: CandidateMetrics["values"],
): ConditionEvaluation {
  const actual = values[condition.field] ?? null;

  if (actual === null) {
    return {
      field: condition.field,
      operator: condition.operator,
      threshold: condition.value,
      actual: null,
      met: "unknown",
    };
  }

  let met: boolean;
  switch (condition.operator) {
    case "gt":
      met = (actual as number) > (condition.value as number);
      break;
    case "gte":
      met = (actual as number) >= (condition.value as number);
      break;
    case "lt":
      met = (actual as number) < (condition.value as number);
      break;
    case "lte":
      met = (actual as number) <= (condition.value as number);
      break;
    case "eq":
      met = actual === condition.value;
      break;
    case "in":
      met = Array.isArray(condition.value) && condition.value.includes(actual as string);
      break;
    default:
      met = false;
  }

  return { field: condition.field, operator: condition.operator, threshold: condition.value, actual, met };
}

/**
 * Evaluasi filter terhadap satu kandidat. Unknown TIDAK otomatis pass (lihat
 * AGENTS.md §9) — kondisi dengan field unknown dianggap tidak terpenuhi untuk
 * tujuan "passed", tapi dicatat terpisah di missingFields agar UI bisa
 * menawarkan filter "hanya data tersedia".
 */
export function evaluateFilter(node: FilterNode, candidate: CandidateMetrics): EvaluationResult {
  const reasons: ConditionEvaluation[] = [];
  const missingFields = new Set<FilterField>();

  function walk(n: FilterNode): boolean {
    if (n.type === "condition") {
      const evaluation = evaluateCondition(n, candidate.values);
      reasons.push(evaluation);
      if (evaluation.met === "unknown") {
        missingFields.add(n.field);
        return false;
      }
      return evaluation.met;
    }

    const results = n.children.map(walk);
    return n.operator === "and" ? results.every(Boolean) : results.some(Boolean);
  }

  const passed = walk(node);

  return { passed, reasons, missingFields: [...missingFields] };
}

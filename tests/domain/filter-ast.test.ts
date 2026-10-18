import { describe, expect, it } from "vitest";

import { evaluateFilter, validateFilterNode, FilterValidationError, type FilterNode } from "@/domain/filter-ast";

describe("validateFilterNode", () => {
  it("menolak operator kategorikal pada field numerik", () => {
    const node: FilterNode = { type: "condition", field: "per", operator: "in", value: ["a"] };
    expect(() => validateFilterNode(node)).toThrow(FilterValidationError);
  });

  it("menolak operator numerik pada field kategorikal", () => {
    const node: FilterNode = { type: "condition", field: "sector_code", operator: "gt", value: 1 };
    expect(() => validateFilterNode(node)).toThrow(FilterValidationError);
  });

  it("menerima kondisi valid", () => {
    const node: FilterNode = { type: "condition", field: "per", operator: "lte", value: 15 };
    expect(() => validateFilterNode(node)).not.toThrow();
  });
});

describe("evaluateFilter", () => {
  it("unknown tidak otomatis pass", () => {
    const node: FilterNode = { type: "condition", field: "per", operator: "lte", value: 15 };
    const result = evaluateFilter(node, { instrumentId: "x", values: { per: null } });
    expect(result.passed).toBe(false);
    expect(result.missingFields).toEqual(["per"]);
  });

  it("AND group butuh semua kondisi terpenuhi", () => {
    const node: FilterNode = {
      type: "group",
      operator: "and",
      children: [
        { type: "condition", field: "per", operator: "lte", value: 15 },
        { type: "condition", field: "roe", operator: "gte", value: 0.1 },
      ],
    };
    const passing = evaluateFilter(node, { instrumentId: "x", values: { per: 10, roe: 0.12 } });
    expect(passing.passed).toBe(true);

    const failing = evaluateFilter(node, { instrumentId: "x", values: { per: 20, roe: 0.12 } });
    expect(failing.passed).toBe(false);
  });

  it("OR group cukup salah satu kondisi terpenuhi", () => {
    const node: FilterNode = {
      type: "group",
      operator: "or",
      children: [
        { type: "condition", field: "per", operator: "lte", value: 5 },
        { type: "condition", field: "roe", operator: "gte", value: 0.1 },
      ],
    };
    const result = evaluateFilter(node, { instrumentId: "x", values: { per: 20, roe: 0.12 } });
    expect(result.passed).toBe(true);
  });
});

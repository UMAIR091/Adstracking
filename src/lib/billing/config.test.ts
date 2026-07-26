import { describe, it, expect } from "vitest";
import { getPlan, limitsForPlan, planRank } from "./config";

describe("plan config", () => {
  it("resolves known plans with client limits", () => {
    expect(getPlan("pro")?.limits.maxClients).toBe(5);
    expect(getPlan("pro_plus")?.limits.maxClients).toBe(10);
    expect(getPlan("growth")?.limits.maxClients).toBe(25);
  });

  it("orders plans by capacity (rank monotonic with size)", () => {
    expect(planRank("pro")).toBeLessThan(planRank("pro_plus"));
    expect(planRank("pro_plus")).toBeLessThan(planRank("growth"));
    expect(planRank("growth")).toBeLessThan(planRank("agency"));
  });

  it("limitsForPlan falls back safely for unknown/nullish input", () => {
    const limits = limitsForPlan(undefined);
    expect(typeof limits.maxClients).toBe("number");
    expect(limits.maxClients).toBeGreaterThanOrEqual(0);
  });
});

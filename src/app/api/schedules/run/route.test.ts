import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Static check, like the other route guards: "run now" generates a report and
// emails it, so it must share the generation route's per-workspace limit.
const src = readFileSync(path.join(__dirname, "route.ts"), "utf8");

describe("schedules/run route", () => {
  it("draws on the report-generation rate limit before generating or sending", () => {
    const limit = src.indexOf("rateLimit(`report-gen:${agency.id}`");
    expect(limit).toBeGreaterThan(-1);
    expect(limit).toBeLessThan(src.indexOf("createClientReport("));
    expect(limit).toBeLessThan(src.indexOf("deliverReport("));
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isShareAction, newShareToken } from "@/lib/reports/shareLink";

// Static checks on the route (like the other route guards) plus the pure helpers.
const route = readFileSync(path.join(__dirname, "route.ts"), "utf8");
const send = readFileSync(path.join(__dirname, "..", "send", "route.ts"), "utf8");

describe("share link route", () => {
  it("only changes a report the caller's workspace owns", () => {
    expect(route).toMatch(/getCurrentUserAndAgency\(\)/);
    // Looked up through the caller's session AND scoped to their agency…
    expect(route).toMatch(/\.from\("reports"\)\s*\.select\("id"\)\s*\.eq\("id", params\.id\)\s*\.eq\("agency_id", agency\.id\)/);
    // …and the service-role write is scoped the same way.
    expect(route).toMatch(/update\(\{ share_token: shareToken \}\)\s*\.eq\("id", params\.id\)\s*\.eq\("agency_id", agency\.id\)/);
  });

  it("is rate-limited per workspace", () => {
    expect(route).toMatch(/rateLimit\(`report-share:\$\{agency\.id\}`/);
  });
});

describe("share link helpers", () => {
  it("accepts only revoke and renew", () => {
    expect(isShareAction("revoke")).toBe(true);
    expect(isShareAction("renew")).toBe(true);
    expect(isShareAction("delete")).toBe(false);
    expect(isShareAction(undefined)).toBe(false);
  });

  it("makes 128-bit hex tokens that don't repeat", () => {
    const a = newShareToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newShareToken()).not.toBe(a);
  });
});

describe("emailing a report with a revoked link", () => {
  it("creates a fresh link instead of sending a dead one", () => {
    expect(send).toMatch(/if \(!shareToken\) \{\s*shareToken = newShareToken\(\);/);
    expect(send).not.toMatch(/shareToken: report\.shareToken \?\? ""/);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Read the source rather than importing the route, so this stays a pure static
// check with no auth, database or email mocks (same approach as the other
// route guards in this folder).
const src = readFileSync(path.join(__dirname, "route.ts"), "utf8");

describe("team invite route", () => {
  it("rate-limits invitations per workspace", () => {
    expect(src).toMatch(/rateLimit\(`team-invite:\$\{agency\.id\}`/);
    expect(src).toMatch(/tooManyRequests\(/);
  });

  it("checks the limit after the admin check and before any invitation is written or emailed", () => {
    const admin = src.indexOf("isAdminRole(role)");
    const limit = src.indexOf("rateLimit(`team-invite:");
    const write = src.indexOf(".from(\"invitations\")");
    const send = src.indexOf("sendEmailWithRetry(");
    expect(admin).toBeGreaterThan(-1);
    expect(limit).toBeGreaterThan(admin);
    expect(write === -1 || limit < write).toBe(true);
    expect(limit).toBeLessThan(send);
  });
});

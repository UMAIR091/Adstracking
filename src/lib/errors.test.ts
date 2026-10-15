import { describe, it, expect, vi } from "vitest";

// Monitoring must not be required for these pure checks.
vi.mock("@/lib/monitoring", () => ({ captureException: () => {} }));

import { isSafeMessage, logDetail, publicError, UserFacingError } from "./errors";

describe("isSafeMessage", () => {
  it("allows short, user-fixable messages", () => {
    expect(isSafeMessage("Invalid API key")).toBe(true);
    expect(isSafeMessage("You've reached your plan limit reached")).toBe(true);
    expect(isSafeMessage("Please reconnect this source")).toBe(true);
  });

  it("blocks internals and long/DB/stack strings", () => {
    expect(isSafeMessage('null value in column "x" violates not-null constraint')).toBe(false);
    expect(isSafeMessage("select * from data_sources failed")).toBe(false);
    expect(isSafeMessage("connect ECONNREFUSED 127.0.0.1:5432")).toBe(false);
    expect(isSafeMessage("x".repeat(300))).toBe(false);
  });
});

describe("publicError", () => {
  it("passes through safe messages and always returns an id", () => {
    const r = publicError(new Error("Invalid token"));
    expect(r.error).toBe("Invalid token");
    expect(r.errorId).toHaveLength(8);
  });

  it("masks unsafe messages behind the fallback + ref id", () => {
    const r = publicError(new Error("relation reports does not exist"), "Something went wrong.");
    expect(r.error).toContain("Something went wrong.");
    expect(r.error).toContain(r.errorId);
    expect(r.error).not.toContain("relation");
  });
});

describe("UserFacingError", () => {
  it("is shown verbatim even when longer than the safe-message limit", () => {
    const msg = "x".repeat(40) + " sign in with the account that owns it, or go back and choose the other sign-in option. " + "y".repeat(80);
    const r = publicError(new UserFacingError(msg, "Code=105"), "Fallback.");
    expect(r.error).toBe(msg);
  });

  it("logs the technical detail, not the rewritten message", () => {
    expect(logDetail(new UserFacingError("Friendly.", "Code=105 InvalidCredentials"))).toBe("Code=105 InvalidCredentials");
    expect(logDetail(new Error("raw"))).toBe("raw");
  });
});

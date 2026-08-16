import { describe, expect, it } from "vitest";
import { sourceHealth, needsAttention, countHealth, SOURCE_HEALTH, type SourceHealth } from "./status";

// These tests pin the rules that made four screens disagree (P0-1). The
// classifier is the single definition every screen now reads, so a regression
// here is a regression everywhere at once.
describe("sourceHealth", () => {
  it("is healthy when connected, configured and nothing failed", () => {
    expect(sourceHealth({ status: "connected", lastSyncError: null, selectedAccountId: "acc_1" })).toBe("healthy");
  });

  // The bug this whole fix exists for: the sync writes "No ad account selected"
  // into last_sync_error, which used to make setup-incomplete read as breakage.
  it("does NOT count a source with no account selected as a sync failure", () => {
    expect(sourceHealth({ status: "connected", lastSyncError: "No ad account selected", selectedAccountId: null }))
      .toBe("needs_account");
  });

  it("reports needs_account even with a clean error column", () => {
    expect(sourceHealth({ status: "connected", lastSyncError: null, selectedAccountId: null })).toBe("needs_account");
  });

  it("reports a genuine sync error only once an account IS selected", () => {
    expect(sourceHealth({ status: "connected", lastSyncError: "429 rate limited", selectedAccountId: "acc_1" }))
      .toBe("sync_error");
    expect(sourceHealth({ status: "error", lastSyncError: null, selectedAccountId: "acc_1" })).toBe("sync_error");
  });

  // A revoked token blocks account selection too, so it must win over needs_account.
  it("puts a revoked token above every other state", () => {
    expect(sourceHealth({ status: "revoked", lastSyncError: null, selectedAccountId: null })).toBe("needs_reconnect");
    expect(sourceHealth({ status: "revoked", lastSyncError: "boom", selectedAccountId: "acc_1" })).toBe("needs_reconnect");
  });
});

describe("needsAttention", () => {
  it("treats healthy as the only quiet state", () => {
    expect(needsAttention("healthy")).toBe(false);
    for (const h of ["needs_account", "sync_error", "needs_reconnect"] as SourceHealth[]) {
      expect(needsAttention(h)).toBe(true);
    }
  });
});

describe("countHealth", () => {
  const states: SourceHealth[] = ["healthy", "healthy", "needs_account", "sync_error", "needs_reconnect"];

  it("counts each state separately", () => {
    const c = countHealth(states);
    expect(c).toMatchObject({ total: 5, healthy: 2, needsAccount: 1, syncError: 1, needsReconnect: 1 });
  });

  // The invariant that makes the dashboard tile and the health page agree: the
  // four states partition the total, and needsAttention is exactly the non-healthy
  // remainder. If these ever drift, the screens show contradictory numbers again.
  it("keeps the four states a partition of the total", () => {
    const c = countHealth(states);
    expect(c.healthy + c.needsAccount + c.syncError + c.needsReconnect).toBe(c.total);
    expect(c.needsAttention).toBe(c.total - c.healthy);
  });

  it("reports zeroes for an empty workspace", () => {
    expect(countHealth([])).toMatchObject({ total: 0, healthy: 0, needsAttention: 0 });
  });
});

describe("SOURCE_HEALTH presentation", () => {
  it("has a label for every state and never leaks the raw key", () => {
    for (const h of ["healthy", "needs_account", "sync_error", "needs_reconnect"] as SourceHealth[]) {
      const p = SOURCE_HEALTH[h];
      expect(p.label).toBeTruthy();
      expect(p.short).toBeTruthy();
      expect(p.label).not.toContain("_");
    }
  });

  // needs_account must never read as plain "Connected" — that's the dishonest
  // status P0-4 removes.
  it("makes the account-selection state visibly distinct from healthy", () => {
    expect(SOURCE_HEALTH.needs_account.label).not.toBe(SOURCE_HEALTH.healthy.label);
    expect(SOURCE_HEALTH.needs_account.label.toLowerCase()).toContain("account");
  });
});

import { describe, expect, it } from "vitest";
import { clientStatus, clientStatusMap, statusFor, CLIENT_STATUS_PRIORITY } from "./clientStatus";

const synced = "2026-10-15T06:00:00Z";

describe("clientStatus", () => {
  it("reads a client with no sources as needing one", () => {
    expect(clientStatus([])).toMatchObject({ key: "setup", tone: "muted", label: "Needs a source" });
  });

  it("puts a revoked source above every other problem", () => {
    const s = clientStatus([
      { health: "needs_account", lastSyncedAt: null },
      { health: "sync_error", lastSyncedAt: synced },
      { health: "needs_reconnect", lastSyncedAt: synced },
    ]);
    expect(s).toMatchObject({ key: "reconnect", tone: "danger" });
  });

  it("flags a failing sync before an account choice", () => {
    expect(clientStatus([{ health: "needs_account", lastSyncedAt: null }, { health: "sync_error", lastSyncedAt: synced }]).key).toBe("sync_error");
  });

  it("asks for an account when that is the only gap", () => {
    expect(clientStatus([{ health: "healthy", lastSyncedAt: synced }, { health: "needs_account", lastSyncedAt: null }])).toMatchObject({
      key: "account",
      tone: "warning",
    });
  });

  it("calls healthy sources that have never synced a first sync", () => {
    expect(clientStatus([{ health: "healthy", lastSyncedAt: null }]).key).toBe("first_sync");
  });

  it("is healthy once a healthy source has synced", () => {
    expect(clientStatus([{ health: "healthy", lastSyncedAt: synced }, { health: "healthy", lastSyncedAt: null }])).toMatchObject({
      key: "healthy",
      tone: "success",
    });
  });
});

describe("clientStatusMap", () => {
  it("rolls rows up per client and treats unknown clients as needing a source", () => {
    const map = clientStatusMap([
      { clientId: "a", health: "healthy", lastSyncedAt: synced },
      { clientId: "a", health: "needs_reconnect", lastSyncedAt: synced },
      { clientId: "b", health: "healthy", lastSyncedAt: synced },
      { clientId: null, health: "sync_error", lastSyncedAt: null },
    ]);
    expect(statusFor(map, "a").key).toBe("reconnect");
    expect(statusFor(map, "b").key).toBe("healthy");
    expect(statusFor(map, "c").key).toBe("setup");
  });

  it("orders problems before healthy clients", () => {
    expect(CLIENT_STATUS_PRIORITY.reconnect).toBeLessThan(CLIENT_STATUS_PRIORITY.account);
    expect(CLIENT_STATUS_PRIORITY.setup).toBeLessThan(CLIENT_STATUS_PRIORITY.healthy);
  });
});

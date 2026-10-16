import { describe, expect, it } from "vitest";
import { dueForScheduledSync, REVOKED_RETRY_MS } from "./syncBatch";

const NOW = Date.parse("2026-10-16T06:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = 24 * 60 * 60 * 1000;

describe("dueForScheduledSync", () => {
  it("syncs every connected or erroring source as before", () => {
    expect(dueForScheduledSync({ status: "connected" }, NOW)).toBe(true);
    expect(dueForScheduledSync({ status: "error", last_sync_failed_at: ago(DAY) }, NOW)).toBe(true);
    expect(dueForScheduledSync({}, NOW)).toBe(true);
  });

  it("rests a revoked source for a week after its last failure", () => {
    expect(dueForScheduledSync({ status: "revoked", last_sync_failed_at: ago(DAY) }, NOW)).toBe(false);
    expect(dueForScheduledSync({ status: "revoked", last_sync_failed_at: ago(REVOKED_RETRY_MS - 1) }, NOW)).toBe(false);
  });

  it("retries it once the week is up, so a wrongly-revoked source still recovers", () => {
    expect(dueForScheduledSync({ status: "revoked", last_sync_failed_at: ago(REVOKED_RETRY_MS) }, NOW)).toBe(true);
    expect(dueForScheduledSync({ status: "revoked", last_sync_failed_at: ago(30 * DAY) }, NOW)).toBe(true);
  });

  it("retries a revoked source with no recorded failure time", () => {
    expect(dueForScheduledSync({ status: "revoked", last_sync_failed_at: null }, NOW)).toBe(true);
  });
});

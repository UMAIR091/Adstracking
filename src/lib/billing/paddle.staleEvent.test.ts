import { describe, expect, it } from "vitest";
import { isStaleSubscriptionEvent } from "./paddle";

const stored = { provider_subscription_id: "sub_1", provider_updated_at: "2026-10-16T10:00:00Z" };

describe("isStaleSubscriptionEvent", () => {
  it("ignores an older state of the same subscription arriving late", () => {
    expect(isStaleSubscriptionEvent(stored, { subscriptionId: "sub_1", updatedAt: "2026-10-16T09:59:59Z" })).toBe(true);
  });

  it("applies a newer or same-time state", () => {
    expect(isStaleSubscriptionEvent(stored, { subscriptionId: "sub_1", updatedAt: "2026-10-16T10:00:01Z" })).toBe(false);
    expect(isStaleSubscriptionEvent(stored, { subscriptionId: "sub_1", updatedAt: "2026-10-16T10:00:00Z" })).toBe(false);
  });

  it("is never stale without both times (rows written before the column existed)", () => {
    expect(isStaleSubscriptionEvent({ provider_subscription_id: "sub_1", provider_updated_at: null }, { subscriptionId: "sub_1", updatedAt: "2026-01-01T00:00:00Z" })).toBe(false);
    expect(isStaleSubscriptionEvent(stored, { subscriptionId: "sub_1", updatedAt: null })).toBe(false);
    expect(isStaleSubscriptionEvent(null, { subscriptionId: "sub_1", updatedAt: "2026-01-01T00:00:00Z" })).toBe(false);
  });

  it("leaves a different subscription to the superseded-subscription check", () => {
    expect(isStaleSubscriptionEvent(stored, { subscriptionId: "sub_2", updatedAt: "2020-01-01T00:00:00Z" })).toBe(false);
  });
});

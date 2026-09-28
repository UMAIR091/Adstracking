import { describe, it, expect } from "vitest";
import { resolveState, type SubscriptionRow } from "./subscription";

const DAY = 24 * 60 * 60 * 1000;
const longAgo = new Date(Date.now() - 90 * DAY).toISOString(); // app trial long over
const justNow = new Date().toISOString(); // app trial still running

function row(over: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    id: "r1",
    plan: "pro",
    status: "active",
    provider: "paddle",
    provider_customer_id: "ctm_1",
    provider_subscription_id: "sub_1",
    variant_id: null,
    price_id: "pri_1",
    billing_interval: "monthly",
    current_period_end: null,
    ends_at: null,
    cancel_at_period_end: false,
    trial_ends_at: null,
    card_brand: null,
    card_last_four: null,
    payment_failed_at: null,
    ...over,
  };
}

describe("resolveState", () => {
  it("treats an active Paddle subscription as live and current", () => {
    const s = resolveState(row({}), longAgo);
    expect(s.plan).toBe("pro");
    expect(s.subscriptionLive).toBe(true);
    expect(s.hasAccess).toBe(true);
    expect(s.previous).toBeNull();
  });

  // The reported bug: a cancelled subscription kept "Pro" as the current plan,
  // so the billing page offered "Manage billing" instead of a way to pay.
  it("drops an ended subscription to Free and remembers the plan it was on", () => {
    const endedAt = new Date(Date.now() - 30 * DAY).toISOString();
    const s = resolveState(row({ status: "cancelled", ends_at: endedAt }), longAgo);
    expect(s.plan).toBe("free");
    expect(s.subscriptionLive).toBe(false);
    expect(s.hasAccess).toBe(true); // Free, not a lockout
    expect(s.previous).toMatchObject({ plan: "pro", planName: "Pro", status: "cancelled", endedAt, subscriptionId: "sub_1" });
  });

  it("puts an ended subscription back on the app trial while it still runs", () => {
    const s = resolveState(row({ status: "cancelled", ends_at: new Date(Date.now() - DAY).toISOString() }), justNow);
    expect(s.plan).toBe("trial");
    expect(s.previous?.plan).toBe("pro");
  });

  it("keeps a cancelled subscription with paid time left on its plan, but not live", () => {
    const s = resolveState(row({ status: "cancelled", ends_at: new Date(Date.now() + 5 * DAY).toISOString() }), longAgo);
    expect(s.plan).toBe("pro");
    expect(s.hasAccess).toBe(true);
    expect(s.subscriptionLive).toBe(false); // Paddle can't change it — new checkout only
  });

  it("keeps a paused subscription live (resumable) but without access", () => {
    const s = resolveState(row({ status: "paused" }), longAgo);
    expect(s.subscriptionLive).toBe(true);
    expect(s.hasAccess).toBe(false);
  });

  it("is not live without a provider subscription id", () => {
    expect(resolveState(row({ provider_subscription_id: null }), longAgo).subscriptionLive).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { COMPLIMENTARY, resolveState, withComplimentary, type SubscriptionRow } from "./subscription";

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

describe("withComplimentary", () => {
  const OWNER = Object.keys(COMPLIMENTARY)[0];
  const ended = row({ status: "cancelled", ends_at: new Date(Date.now() - 30 * DAY).toISOString() });

  it("gives the granted workspace Pro with no end date, even after its own subscription ended", () => {
    const s = withComplimentary(OWNER, resolveState(ended, longAgo));
    expect(s).toMatchObject({ plan: "pro", status: "complimentary", hasAccess: true, endsAt: null, renewsAt: null, previous: null, subscriptionLive: false });
  });

  it("covers a workspace that never subscribed and is past its trial", () => {
    expect(withComplimentary(OWNER, resolveState(null, longAgo)).plan).toBe("pro");
  });

  it("changes nothing for any other workspace", () => {
    const free = resolveState(ended, longAgo);
    expect(withComplimentary("00000000-0000-0000-0000-000000000000", free)).toBe(free);
    expect(free.plan).toBe("free");
  });

  it("lets a real paid plan win while it grants access", () => {
    const paying = resolveState(row({ plan: "agency" }), longAgo);
    expect(withComplimentary(OWNER, paying)).toBe(paying);
  });

  it("grants only one workspace", () => {
    expect(Object.keys(COMPLIMENTARY)).toHaveLength(1);
  });
});

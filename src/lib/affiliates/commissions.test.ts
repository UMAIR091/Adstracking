import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/monitoring", () => ({ captureException: vi.fn() }));

import { applyAdjustment, recordCommission, type CommissionTransaction } from "./commissions";
import { memoryDb } from "./memoryDb";

// Commissions from Paddle payments: recorded once per transaction, only for
// referred agencies, only on real money, under the affiliate's terms — and
// corrected by refunds and chargebacks.

const NOW = new Date("2026-10-13T00:00:00Z");

function setup(affiliate: Record<string, unknown> = {}) {
  return memoryDb({
    affiliates: [{ id: "aff1", code: "creator", email: "c@x.com", status: "active", commission_pct: "20.00", commission_type: "recurring", recurring_months: null, ...affiliate }],
    referrals: [{ agency_id: "ag1", affiliate_id: "aff1", first_paid_at: null, first_transaction_id: null }],
    affiliate_commissions: [],
  }, {
    // Column defaults from migration 0043.
    defaults: { affiliate_commissions: { refunded_net_minor: 0, applied_adjustment_ids: [], clawback_needed: false, note: null, reversed_at: null, paid_at: null } },
  });
}

const tx = (id: string, billedAt: string, subtotal = "4900", discount = "0"): CommissionTransaction => ({
  id,
  currencyCode: "USD",
  billedAt,
  details: { totals: { subtotal, discount, currencyCode: "USD" } },
});

describe("recordCommission", () => {
  it("records the commission on the pre-tax amount after discount, with the rate snapshotted", async () => {
    const m = setup();
    expect(await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_1", "2026-10-01T00:00:00Z", "4900", "490"), now: NOW })).toBe("recorded");
    expect(m.db.affiliate_commissions).toHaveLength(1);
    expect(m.db.affiliate_commissions[0]).toMatchObject({
      affiliate_id: "aff1",
      agency_id: "ag1",
      paddle_transaction_id: "txn_1",
      currency: "USD",
      net_amount_minor: 4410,
      commission_pct: 20,
      commission_amount_minor: 882,
      status: "pending",
      payable_after: "2026-11-12T00:00:00.000Z",
    });
    expect(m.db.referrals[0]).toMatchObject({ first_paid_at: "2026-10-01T00:00:00.000Z", first_transaction_id: "txn_1" });
  });

  it("is idempotent: a replayed webhook creates no second row", async () => {
    const m = setup();
    await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_1", "2026-10-01T00:00:00Z"), now: NOW });
    await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_1", "2026-10-01T00:00:00Z"), now: NOW });
    expect(m.db.affiliate_commissions).toHaveLength(1);
  });

  it("does nothing for an agency nobody referred", async () => {
    const m = setup();
    expect(await recordCommission(m.client, { agencyId: "other", tx: tx("txn_1", "2026-10-01T00:00:00Z"), now: NOW })).toBe("no_referral");
    expect(m.db.affiliate_commissions).toHaveLength(0);
  });

  it("skips a zero-amount transaction (a trial start) without making it the first payment", async () => {
    const m = setup();
    expect(await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_0", "2026-10-01T00:00:00Z", "0"), now: NOW })).toBe("zero_amount");
    expect(m.db.referrals[0].first_paid_at).toBeNull();
  });

  it("first_payment pays only on the first real payment", async () => {
    const m = setup({ commission_type: "first_payment" });
    expect(await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_1", "2026-10-01T00:00:00Z"), now: NOW })).toBe("recorded");
    expect(await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_2", "2026-11-01T00:00:00Z"), now: NOW })).toBe("not_eligible");
    expect(m.db.affiliate_commissions.map((c) => c.paddle_transaction_id)).toEqual(["txn_1"]);
  });

  it("recurring stops at the window's edge", async () => {
    const m = setup({ recurring_months: 2 });
    await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_1", "2026-07-15T00:00:00Z"), now: NOW });
    expect(await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_2", "2026-09-14T23:59:59Z"), now: NOW })).toBe("recorded");
    expect(await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_3", "2026-09-15T00:00:00Z"), now: NOW })).toBe("not_eligible");
  });

  it("an earlier payment arriving late becomes the anchor", async () => {
    const m = setup({ commission_type: "first_payment" });
    await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_2", "2026-11-01T00:00:00Z"), now: NOW });
    await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_1", "2026-10-01T00:00:00Z"), now: NOW });
    expect(m.db.referrals[0]).toMatchObject({ first_transaction_id: "txn_1" });
  });

  it("never throws: a database failure is reported and the webhook carries on", async () => {
    const broken = { from: () => { throw new Error("db down"); } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await recordCommission(broken as any, { agencyId: "ag1", tx: tx("txn_1", "2026-10-01T00:00:00Z"), now: NOW })).toBe("failed");
  });
});

describe("applyAdjustment", () => {
  async function withCommission(status = "pending") {
    const m = setup();
    await recordCommission(m.client, { agencyId: "ag1", tx: tx("txn_1", "2026-10-01T00:00:00Z", "10000"), now: NOW });
    m.db.affiliate_commissions[0].status = status;
    return m;
  }
  const refund = (over: Record<string, unknown> = {}) => ({
    id: "adj_1", action: "refund", type: "full", status: "approved", transactionId: "txn_1", totals: { subtotal: "10000" }, ...over,
  });

  it("reverses the commission on an approved full refund", async () => {
    const m = await withCommission();
    expect(await applyAdjustment(m.client, refund(), NOW)).toBe("applied");
    expect(m.db.affiliate_commissions[0]).toMatchObject({ status: "reversed", reversed_at: NOW.toISOString(), clawback_needed: false });
  });

  it("flags a clawback when the commission was already paid", async () => {
    const m = await withCommission("paid");
    await applyAdjustment(m.client, refund(), NOW);
    expect(m.db.affiliate_commissions[0]).toMatchObject({ status: "reversed", clawback_needed: true, commission_amount_minor: 2000 });
    expect(String(m.db.affiliate_commissions[0].note)).toContain("recover $20.00 already paid out");
  });

  it("reduces proportionally on a partial refund", async () => {
    const m = await withCommission();
    await applyAdjustment(m.client, refund({ type: "partial", totals: { subtotal: "2500" } }), NOW);
    expect(m.db.affiliate_commissions[0]).toMatchObject({ status: "pending", commission_amount_minor: 1500, refunded_net_minor: 2500 });
  });

  it("applies an adjustment once, however often it arrives", async () => {
    const m = await withCommission();
    const partial = refund({ type: "partial", totals: { subtotal: "2500" } });
    await applyAdjustment(m.client, partial, NOW);
    expect(await applyAdjustment(m.client, partial, NOW)).toBe("already_applied");
    expect(m.db.affiliate_commissions[0]).toMatchObject({ commission_amount_minor: 1500, refunded_net_minor: 2500 });
  });

  it("ignores pending refunds, credits, and transactions without a commission", async () => {
    const m = await withCommission();
    expect(await applyAdjustment(m.client, refund({ status: "pending_approval" }), NOW)).toBe("ignored");
    expect(await applyAdjustment(m.client, refund({ action: "credit" }), NOW)).toBe("ignored");
    expect(await applyAdjustment(m.client, refund({ transactionId: "txn_other" }), NOW)).toBe("no_commission");
    expect(m.db.affiliate_commissions[0].status).toBe("pending");
  });

  it("treats an approved chargeback like a refund", async () => {
    const m = await withCommission();
    expect(await applyAdjustment(m.client, refund({ action: "chargeback" }), NOW)).toBe("applied");
    expect(m.db.affiliate_commissions[0].status).toBe("reversed");
  });
});

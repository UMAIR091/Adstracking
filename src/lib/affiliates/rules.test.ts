import { describe, expect, it } from "vitest";
import {
  addMonths,
  applyRefund,
  commissionEligible,
  commissionMinor,
  cookieDays,
  decodeRefCookie,
  effectiveStatus,
  encodeRefCookie,
  holdDays,
  isSelfReferral,
  netAmountMinor,
  normalizeRefCode,
  payableAfter,
  type CommissionRow,
} from "./rules";

describe("normalizeRefCode", () => {
  it("accepts valid codes, lowercased", () => {
    expect(normalizeRefCode("creator")).toBe("creator");
    expect(normalizeRefCode("Creator_Name-2")).toBe("creator_name-2");
    expect(normalizeRefCode("  ab ")).toBe("ab");
    expect(normalizeRefCode("a".repeat(32))).toBe("a".repeat(32));
  });

  it("rejects malformed values silently", () => {
    for (const bad of [null, undefined, "", "a", "_creator", "-x", "a".repeat(33), "has space", "emoji😀", "semi;colon", "a/b", "x:y"]) {
      expect(normalizeRefCode(bad as string)).toBeNull();
    }
  });
});

describe("the referral cookie value", () => {
  it("round-trips a code and a plain landing path", () => {
    expect(decodeRefCookie(encodeRefCookie("creator", "/pricing"))).toEqual({ code: "creator", landingPath: "/pricing" });
    expect(decodeRefCookie(encodeRefCookie("creator", "/"))).toEqual({ code: "creator", landingPath: "/" });
  });

  it("drops a landing path it can't vouch for", () => {
    expect(encodeRefCookie("creator", "/x?y=1")).toBe("creator");
    expect(decodeRefCookie("creator:/<script>")).toEqual({ code: "creator", landingPath: null });
  });

  it("rejects a cookie whose code is invalid", () => {
    expect(decodeRefCookie("BAD CODE:/")).toBeNull();
    expect(decodeRefCookie("")).toBeNull();
  });
});

describe("isSelfReferral", () => {
  it("matches emails case-insensitively", () => {
    expect(isSelfReferral("Creator@Example.com", "creator@example.com ")).toBe(true);
    expect(isSelfReferral("someone@example.com", "creator@example.com")).toBe(false);
  });

  it("never matches a missing email", () => {
    expect(isSelfReferral("", "")).toBe(false);
    expect(isSelfReferral(null, "creator@example.com")).toBe(false);
  });
});

describe("commissionMinor", () => {
  it("is net × rate / 100, rounded half up, in integers", () => {
    expect(commissionMinor(4900, 20)).toBe(980);
    expect(commissionMinor(4900, "20.00")).toBe(980);
    expect(commissionMinor(999, 33.33)).toBe(333); // 332.9667
    expect(commissionMinor(5, 50)).toBe(3); // 2.5 rounds up
    expect(commissionMinor(1, 50)).toBe(1); // 0.5 rounds up
    expect(commissionMinor(1, 49.99)).toBe(0);
  });

  it("handles the 0% and 100% edges", () => {
    expect(commissionMinor(4900, 0)).toBe(0);
    expect(commissionMinor(4900, 100)).toBe(4900);
    expect(commissionMinor(0, 30)).toBe(0);
  });

  it("is exact where floats are not (0.29 × 100 is 28.999… in floating point)", () => {
    expect(commissionMinor(100, 0.29)).toBe(0); // 0.29 → exact 0.29
    expect(commissionMinor(10000, 0.29)).toBe(29);
    expect(commissionMinor(123_456_789, 12.34)).toBe(15_234_568); // 15,234,567.76
  });

  it("refuses an invalid rate or amount", () => {
    expect(() => commissionMinor(100, 101)).toThrow();
    expect(() => commissionMinor(100, -1)).toThrow();
    expect(() => commissionMinor(1.5, 10)).toThrow();
  });
});

describe("netAmountMinor", () => {
  it("is subtotal minus discount, never tax", () => {
    expect(netAmountMinor({ subtotal: "4900", discount: "980" })).toBe(3920);
    expect(netAmountMinor({ subtotal: "4900", discount: "0" })).toBe(4900);
  });

  it("is zero for a trial start and null for unreadable totals", () => {
    expect(netAmountMinor({ subtotal: "0", discount: "0" })).toBe(0);
    expect(netAmountMinor(null)).toBeNull();
    expect(netAmountMinor({ subtotal: "abc" })).toBeNull();
  });
});

describe("commissionEligible", () => {
  const first = { transactionId: "txn_1", paidAt: new Date("2026-01-31T10:00:00Z") };

  it("first_payment pays on the first payment only", () => {
    const terms = { commissionType: "first_payment" as const, recurringMonths: null };
    expect(commissionEligible(terms, first, first)).toBe(true);
    expect(commissionEligible(terms, { transactionId: "txn_2", paidAt: new Date("2026-02-28T10:00:00Z") }, first)).toBe(false);
  });

  it("recurring with no limit pays on every payment", () => {
    const terms = { commissionType: "recurring" as const, recurringMonths: null };
    expect(commissionEligible(terms, { transactionId: "txn_9", paidAt: new Date("2030-01-01T00:00:00Z") }, first)).toBe(true);
  });

  it("recurring pays within N months of the first payment, not at or after the boundary", () => {
    const terms = { commissionType: "recurring" as const, recurringMonths: 3 };
    // 31 Jan + 3 months = 30 Apr (month-end clamped).
    expect(addMonths(first.paidAt, 3).toISOString()).toBe("2026-04-30T10:00:00.000Z");
    expect(commissionEligible(terms, { transactionId: "a", paidAt: new Date("2026-04-30T09:59:59Z") }, first)).toBe(true);
    expect(commissionEligible(terms, { transactionId: "b", paidAt: new Date("2026-04-30T10:00:00Z") }, first)).toBe(false);
  });
});

describe("hold and status", () => {
  it("payable_after is the hold after creation", () => {
    expect(payableAfter(new Date("2026-10-01T00:00:00Z"), 30).toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("pending reads as payable once the hold has passed", () => {
    const now = Date.parse("2026-10-31T00:00:00Z");
    expect(effectiveStatus("pending", "2026-10-31T00:00:00Z", now)).toBe("payable");
    expect(effectiveStatus("pending", "2026-10-31T00:00:01Z", now)).toBe("pending");
    expect(effectiveStatus("paid", "2026-01-01T00:00:00Z", now)).toBe("paid");
    expect(effectiveStatus("reversed", "2026-01-01T00:00:00Z", now)).toBe("reversed");
  });

  it("env settings fall back to the defaults on anything but a positive integer", () => {
    expect(cookieDays(undefined)).toBe(60);
    expect(cookieDays("90")).toBe(90);
    expect(cookieDays("-1")).toBe(60);
    expect(holdDays("abc")).toBe(30);
    expect(holdDays("45")).toBe(45);
  });
});

describe("applyRefund", () => {
  const row = (over: Partial<CommissionRow> = {}): CommissionRow => ({
    status: "pending",
    net_amount_minor: 10_000,
    commission_pct: 20,
    commission_amount_minor: 2_000,
    refunded_net_minor: 0,
    clawback_needed: false,
    applied_adjustment_ids: [],
    ...over,
  });

  it("reverses on a full refund, keeping the amount for the reversed total", () => {
    expect(applyRefund(row(), { id: "adj_1", refundedNetMinor: 10_000, full: true })).toMatchObject({
      status: "reversed", reversed: true, commission_amount_minor: 2_000, refunded_net_minor: 10_000, clawback_needed: false, clawbackMinor: 0,
    });
  });

  it("reduces proportionally on a partial refund, and partials accumulate", () => {
    const once = applyRefund(row(), { id: "adj_1", refundedNetMinor: 2_500, full: false })!;
    expect(once).toMatchObject({ status: "pending", commission_amount_minor: 1_500, refunded_net_minor: 2_500, reversed: false });
    const twice = applyRefund(row({ ...once }), { id: "adj_2", refundedNetMinor: 7_500, full: false })!;
    expect(twice).toMatchObject({ status: "reversed", reversed: true, refunded_net_minor: 10_000 });
  });

  it("flags a clawback when the commission was already paid, without rewriting what was paid", () => {
    expect(applyRefund(row({ status: "paid" }), { id: "adj_1", refundedNetMinor: 10_000, full: true })).toMatchObject({
      status: "reversed", clawback_needed: true, commission_amount_minor: 2_000, clawbackMinor: 2_000,
    });
    expect(applyRefund(row({ status: "paid" }), { id: "adj_1", refundedNetMinor: 5_000, full: false })).toMatchObject({
      status: "paid", clawback_needed: true, commission_amount_minor: 2_000, clawbackMinor: 1_000,
    });
  });

  it("applies the same adjustment once (replayed webhook)", () => {
    expect(applyRefund(row({ applied_adjustment_ids: ["adj_1"] }), { id: "adj_1", refundedNetMinor: 5_000, full: false })).toBeNull();
  });
});

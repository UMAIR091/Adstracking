import { describe, expect, it } from "vitest";
import { csvCell, validateAffiliate, type AffiliateInput } from "./validate";
import { adminEmails, isPlatformAdmin } from "@/lib/admin";

const base: AffiliateInput = {
  code: "Creator",
  name: " Creator Name ",
  email: "Creator@Example.com",
  status: "active",
  commissionPct: "20",
  commissionType: "recurring",
  recurringMonths: "",
};

describe("validateAffiliate", () => {
  it("normalises a valid affiliate", () => {
    const r = validateAffiliate(base);
    expect(r).toEqual({
      ok: true,
      row: {
        code: "creator", name: "Creator Name", email: "creator@example.com", notes: null, status: "active",
        commission_pct: 20, commission_type: "recurring", recurring_months: null,
        discount_code: null, payout_method: null, payout_details: null,
      },
    });
  });

  it("rejects a bad code, name or email", () => {
    expect(validateAffiliate({ ...base, code: "a" }).ok).toBe(false);
    expect(validateAffiliate({ ...base, code: "has space" }).ok).toBe(false);
    expect(validateAffiliate({ ...base, name: "  " }).ok).toBe(false);
    expect(validateAffiliate({ ...base, email: "not-an-email" }).ok).toBe(false);
  });

  it("keeps the rate between 0 and 100 with at most two decimals", () => {
    expect(validateAffiliate({ ...base, commissionPct: "0" }).ok).toBe(true);
    expect(validateAffiliate({ ...base, commissionPct: "100" }).ok).toBe(true);
    expect(validateAffiliate({ ...base, commissionPct: "33.33" }).ok).toBe(true);
    expect(validateAffiliate({ ...base, commissionPct: "100.01" }).ok).toBe(false);
    expect(validateAffiliate({ ...base, commissionPct: "-1" }).ok).toBe(false);
    expect(validateAffiliate({ ...base, commissionPct: "" }).ok).toBe(false);
    expect(validateAffiliate({ ...base, commissionPct: "12.345" }).ok).toBe(false);
  });

  it("takes recurring months only for recurring terms", () => {
    expect(validateAffiliate({ ...base, recurringMonths: "12" })).toMatchObject({ ok: true, row: { recurring_months: 12 } });
    expect(validateAffiliate({ ...base, recurringMonths: "0" }).ok).toBe(false);
    expect(validateAffiliate({ ...base, recurringMonths: "1.5" }).ok).toBe(false);
    expect(validateAffiliate({ ...base, commissionType: "first_payment", recurringMonths: "12" })).toMatchObject({ ok: true, row: { recurring_months: null } });
  });
});

describe("csvCell", () => {
  it("quotes, doubles quotes, and neutralises spreadsheet formulas", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell("@cmd")).toBe(`"'@cmd"`);
    expect(csvCell(null)).toBe('""');
    expect(csvCell(12.5)).toBe('"12.5"');
  });
});

describe("the platform-admin gate", () => {
  it("matches ADMIN_EMAILS case-insensitively", () => {
    expect(isPlatformAdmin("Owner@Example.com", " owner@example.com , other@x.com")).toBe(true);
    expect(isPlatformAdmin("someone@example.com", "owner@example.com")).toBe(false);
  });

  it("fails closed when ADMIN_EMAILS is unset or empty", () => {
    expect(adminEmails(undefined).size).toBe(0);
    expect(isPlatformAdmin("owner@example.com", "")).toBe(false);
    expect(isPlatformAdmin("", "owner@example.com")).toBe(false);
  });
});

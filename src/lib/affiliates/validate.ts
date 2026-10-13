// Validation for the admin page's affiliate form. Pure, so the rules are the
// same in the server action and its tests, and mirror the 0043 checks.
import { AFFILIATE_CODE_RE } from "./rules";

export type AffiliateInput = {
  code: string;
  name: string;
  email: string;
  notes?: string | null;
  status: "active" | "paused";
  commissionPct: number | string;
  commissionType: "first_payment" | "recurring";
  recurringMonths?: number | string | null;
  discountCode?: string | null;
  payoutMethod?: string | null;
  payoutDetails?: string | null;
};

export type AffiliateRow = {
  code: string;
  name: string;
  email: string;
  notes: string | null;
  status: "active" | "paused";
  commission_pct: number;
  commission_type: "first_payment" | "recurring";
  recurring_months: number | null;
  discount_code: string | null;
  payout_method: string | null;
  payout_details: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: string | null | undefined, max = 500) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

export function validateAffiliate(input: AffiliateInput): { ok: true; row: AffiliateRow } | { ok: false; error: string } {
  const code = (input.code ?? "").trim().toLowerCase();
  if (!AFFILIATE_CODE_RE.test(code)) {
    return { ok: false, error: "Code must be 2–32 characters: lowercase letters, numbers, - or _, starting with a letter or number." };
  }
  const name = clean(input.name, 120);
  if (!name) return { ok: false, error: "Name is required." };
  const email = (input.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (input.status !== "active" && input.status !== "paused") return { ok: false, error: "Status must be active or paused." };

  const pctText = String(input.commissionPct ?? "").trim();
  const pct = Number(pctText);
  if (pctText === "" || !Number.isFinite(pct) || pct < 0 || pct > 100) return { ok: false, error: "Commission rate must be between 0 and 100." };
  if (Math.round(pct * 100) !== Number((pct * 100).toFixed(6))) return { ok: false, error: "Commission rate can have at most two decimal places." };

  if (input.commissionType !== "first_payment" && input.commissionType !== "recurring") {
    return { ok: false, error: "Commission type must be first payment or recurring." };
  }
  let months: number | null = null;
  const monthsText = String(input.recurringMonths ?? "").trim();
  if (input.commissionType === "recurring" && monthsText !== "") {
    months = Number(monthsText);
    if (!Number.isInteger(months) || months < 1 || months > 120) return { ok: false, error: "Recurring months must be a whole number from 1 to 120, or blank for no limit." };
  }

  return {
    ok: true,
    row: {
      code,
      name,
      email,
      notes: clean(input.notes, 2000),
      status: input.status,
      commission_pct: Math.round(pct * 100) / 100,
      commission_type: input.commissionType,
      recurring_months: months,
      discount_code: clean(input.discountCode, 64),
      payout_method: clean(input.payoutMethod, 64),
      payout_details: clean(input.payoutDetails, 500),
    },
  };
}

/** CSV cell: quoted, quotes doubled, and spreadsheet formulas neutralised. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

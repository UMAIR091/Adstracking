// Affiliate tracking: the pure rules. No Supabase, no Paddle, no Next — so the
// money and eligibility logic can be unit-tested on its own, and the same
// definitions serve middleware (edge), the webhook and the admin page.
//
// Money is integers in the currency's minor units (cents). Percentages are
// held as basis points internally so a rate like 33.33% never meets float
// rounding.

/** The ?ref= value and affiliates.code: lowercase, 2–32 chars. Mirrors the DB check. */
export const AFFILIATE_CODE_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;

/** First-party cookie that carries a referral from the landing page to signup. */
export const REF_COOKIE = "anavyst_ref";

export const DEFAULT_COOKIE_DAYS = 60;
// Hold before a commission becomes payable. The refund page grants a 14-day
// money-back window; 30 days also covers a refund requested on day 14 that
// still needs Paddle's approval, plus early chargebacks.
export const DEFAULT_HOLD_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function positiveIntEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function cookieDays(env: string | undefined = process.env.AFFILIATE_COOKIE_DAYS): number {
  return positiveIntEnv(env, DEFAULT_COOKIE_DAYS);
}

export function holdDays(env: string | undefined = process.env.AFFILIATE_HOLD_DAYS): number {
  return positiveIntEnv(env, DEFAULT_HOLD_DAYS);
}

/** A ?ref= value as a valid code, or null. Lowercased first; anything else is ignored. */
export function normalizeRefCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  return AFFILIATE_CODE_RE.test(code) ? code : null;
}

// ── The cookie value: "<code>:<landing path>" ─────────────────
// The landing path is kept only when it is a plain path (no query, no odd
// characters) and short, so the cookie can never carry anything else.
const PATH_RE = /^\/[A-Za-z0-9/_-]{0,99}$/;

export function encodeRefCookie(code: string, landingPath: string): string {
  return PATH_RE.test(landingPath) ? `${code}:${landingPath}` : code;
}

export function decodeRefCookie(value: string | null | undefined): { code: string; landingPath: string | null } | null {
  if (!value) return null;
  const at = value.indexOf(":");
  const code = normalizeRefCode(at >= 0 ? value.slice(0, at) : value);
  if (!code) return null;
  const path = at >= 0 ? value.slice(at + 1) : "";
  return { code, landingPath: PATH_RE.test(path) ? path : null };
}

/** The signing-up user is the affiliate themself. */
export function isSelfReferral(userEmail: string | null | undefined, affiliateEmail: string | null | undefined): boolean {
  const a = (userEmail ?? "").trim().toLowerCase();
  const b = (affiliateEmail ?? "").trim().toLowerCase();
  return a !== "" && a === b;
}

/** A rate (0–100, two decimals) as integer basis points, or null when invalid. */
export function pctToBasisPoints(pct: number | string): number | null {
  const n = typeof pct === "string" ? Number(pct) : pct;
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

/**
 * Commission on a net amount: round(net × pct / 100), half up, exact.
 * BigInt so no amount or rate meets floating-point rounding.
 */
export function commissionMinor(netMinor: number, pct: number | string): number {
  const bp = pctToBasisPoints(pct);
  if (bp === null) throw new Error(`invalid commission rate: ${pct}`);
  if (!Number.isInteger(netMinor) || netMinor < 0) throw new Error(`invalid net amount: ${netMinor}`);
  return Number((BigInt(netMinor) * BigInt(bp) * 2n + 10_000n) / 20_000n);
}

/**
 * The pre-tax amount actually charged, after discounts, in minor units:
 * Paddle `details.totals.subtotal − details.totals.discount`. Tax is never
 * included. Paddle sends amounts as integer strings in minor units ("4900").
 * Null when the totals are missing or unreadable.
 */
export function netAmountMinor(totals: { subtotal?: string | null; discount?: string | null } | null | undefined): number | null {
  const sub = Number(totals?.subtotal);
  const disc = Number(totals?.discount ?? "0");
  if (!Number.isInteger(sub) || !Number.isInteger(disc)) return null;
  return Math.max(0, sub - disc);
}

/** `from` plus whole calendar months (end-of-month clamped, UTC). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export type CommissionTerms = {
  commissionType: "first_payment" | "recurring";
  recurringMonths: number | null;
};

/**
 * Whether a payment earns commission under the affiliate's terms.
 *   first_payment — only the agency's first payment above zero.
 *   recurring     — every payment within `recurringMonths` of that first
 *                   payment ([first, first + N months)), or all of them when
 *                   recurringMonths is null.
 */
export function commissionEligible(
  terms: CommissionTerms,
  payment: { transactionId: string; paidAt: Date },
  first: { transactionId: string; paidAt: Date }
): boolean {
  if (terms.commissionType === "first_payment") return payment.transactionId === first.transactionId;
  if (terms.recurringMonths == null) return true;
  return payment.paidAt.getTime() < addMonths(first.paidAt, terms.recurringMonths).getTime();
}

export function payableAfter(createdAt: Date, days: number = holdDays()): Date {
  return new Date(createdAt.getTime() + days * DAY_MS);
}

export type CommissionStatus = "pending" | "payable" | "paid" | "reversed";

/** pending reads as payable once its hold has passed. */
export function effectiveStatus(status: CommissionStatus, payableAfterIso: string, now: number = Date.now()): CommissionStatus {
  return status === "pending" && Date.parse(payableAfterIso) <= now ? "payable" : status;
}

export type CommissionRow = {
  status: CommissionStatus;
  net_amount_minor: number;
  commission_pct: number | string;
  commission_amount_minor: number;
  refunded_net_minor: number;
  clawback_needed: boolean;
  applied_adjustment_ids: string[];
};

export type RefundOutcome = Pick<
  CommissionRow,
  "status" | "commission_amount_minor" | "refunded_net_minor" | "clawback_needed" | "applied_adjustment_ids"
> & {
  reversed: boolean;
  /** Paid-out commission that is no longer owed and must be recovered. */
  clawbackMinor: number;
};

/**
 * The commission after a refund or chargeback of `refundedNetMinor` (pre-tax).
 *
 * Partial refunds reduce the commission proportionally: it is recomputed on
 * the net amount still kept, so successive partial refunds accumulate. A full
 * refund — or partials adding up to the whole — reverses it, keeping the
 * amount on the row so "reversed" totals say what was lost.
 *
 * Once a commission has been PAID its amount is what the affiliate actually
 * received, so it is left as is: the refund instead sets clawback_needed and
 * reports how much of that payout is no longer owed (clawbackMinor).
 *
 * Null when this adjustment was already applied (a replayed webhook).
 */
export function applyRefund(
  row: CommissionRow,
  adjustment: { id: string; refundedNetMinor: number; full: boolean }
): RefundOutcome | null {
  if (row.applied_adjustment_ids.includes(adjustment.id)) return null;
  const refunded = Math.min(row.net_amount_minor, row.refunded_net_minor + Math.max(0, Math.round(adjustment.refundedNetMinor)));
  const reversed = adjustment.full || refunded >= row.net_amount_minor;
  const wasPaid = row.status === "paid";
  const stillOwed = reversed ? 0 : commissionMinor(row.net_amount_minor - refunded, row.commission_pct);
  return {
    status: reversed ? "reversed" : row.status,
    commission_amount_minor: wasPaid || reversed ? row.commission_amount_minor : stillOwed,
    refunded_net_minor: reversed ? row.net_amount_minor : refunded,
    clawback_needed: row.clawback_needed || wasPaid,
    applied_adjustment_ids: [...row.applied_adjustment_ids, adjustment.id],
    reversed,
    clawbackMinor: wasPaid ? Math.max(0, row.commission_amount_minor - stillOwed) : 0,
  };
}

/** "€12.34" style for minor units in a currency; never sums across currencies. */
export function formatMinor(minor: number, currency: string): string {
  const zeroDecimal = new Set(["JPY", "KRW"]);
  const cur = currency.toUpperCase();
  const value = zeroDecimal.has(cur) ? minor : minor / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(value);
  } catch {
    return `${value.toFixed(zeroDecimal.has(cur) ? 0 : 2)} ${cur}`;
  }
}

// Read model for the owner's affiliate pages (/dashboard/admin/affiliates).
// Service role only — callers must have passed requirePlatformAdmin first.
// Totals are kept per currency and never summed across currencies.
import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveStatus, type CommissionStatus } from "./rules";

export type AffiliateRecord = {
  id: string;
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
  created_at: string;
  updated_at: string;
};

export type CommissionRecord = {
  id: string;
  affiliate_id: string;
  agency_id: string;
  paddle_transaction_id: string;
  currency: string;
  net_amount_minor: number;
  commission_pct: number;
  commission_amount_minor: number;
  status: CommissionStatus;
  payable_after: string;
  paid_at: string | null;
  payout_reference: string | null;
  reversed_at: string | null;
  clawback_needed: boolean;
  note: string | null;
  created_at: string;
};

/** status → currency → minor units. */
export type Totals = Record<CommissionStatus, Record<string, number>>;

export function totalsByStatus(rows: Pick<CommissionRecord, "status" | "payable_after" | "currency" | "commission_amount_minor">[], now: number = Date.now()): Totals {
  const out: Totals = { pending: {}, payable: {}, paid: {}, reversed: {} };
  for (const r of rows) {
    const s = effectiveStatus(r.status, r.payable_after, now);
    out[s][r.currency] = (out[s][r.currency] ?? 0) + Number(r.commission_amount_minor);
  }
  return out;
}

export type AffiliateSummary = {
  affiliate: AffiliateRecord;
  signups: number;
  payingAgencies: number;
  totals: Totals;
  clawbacks: number;
};

const AFFILIATE_COLUMNS =
  "id, code, name, email, notes, status, commission_pct, commission_type, recurring_months, discount_code, payout_method, payout_details, created_at, updated_at";

export async function loadAffiliateSummaries(admin: SupabaseClient): Promise<AffiliateSummary[]> {
  const [{ data: affiliates, error }, { data: referrals }, { data: commissions }] = await Promise.all([
    admin.from("affiliates").select(AFFILIATE_COLUMNS).order("created_at", { ascending: false }),
    admin.from("referrals").select("affiliate_id, agency_id"),
    admin.from("affiliate_commissions").select("affiliate_id, agency_id, currency, status, payable_after, commission_amount_minor, clawback_needed"),
  ]);
  if (error) throw new Error(error.message);
  return ((affiliates ?? []) as AffiliateRecord[]).map((a) => {
    const mine = (commissions ?? []).filter((c) => c.affiliate_id === a.id) as (CommissionRecord & { clawback_needed: boolean })[];
    return {
      affiliate: { ...a, commission_pct: Number(a.commission_pct) },
      signups: (referrals ?? []).filter((r) => r.affiliate_id === a.id).length,
      payingAgencies: new Set(mine.map((c) => c.agency_id)).size,
      totals: totalsByStatus(mine),
      clawbacks: mine.filter((c) => c.clawback_needed).length,
    };
  });
}

export type ReferredAgency = {
  agencyId: string;
  name: string;
  capturedAt: string;
  landingPath: string | null;
  firstPaidAt: string | null;
  subscriptionStatus: string | null;
  plan: string | null;
};

export async function loadAffiliateDetail(
  admin: SupabaseClient,
  id: string
): Promise<{ affiliate: AffiliateRecord; agencies: ReferredAgency[]; commissions: (CommissionRecord & { agencyName: string })[] } | null> {
  const { data: affiliate, error } = await admin.from("affiliates").select(AFFILIATE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!affiliate) return null;

  const [{ data: referrals }, { data: commissions }] = await Promise.all([
    admin.from("referrals").select("agency_id, captured_at, landing_path, first_paid_at").eq("affiliate_id", id).order("captured_at", { ascending: false }),
    admin.from("affiliate_commissions").select("*").eq("affiliate_id", id).order("created_at", { ascending: false }),
  ]);
  const agencyIds = Array.from(new Set([...(referrals ?? []).map((r) => r.agency_id), ...(commissions ?? []).map((c) => c.agency_id)])) as string[];
  const [{ data: agencies }, { data: subs }] = agencyIds.length
    ? await Promise.all([
        admin.from("agencies").select("id, name").in("id", agencyIds),
        admin.from("subscriptions").select("agency_id, status, plan").in("agency_id", agencyIds),
      ])
    : [{ data: [] as { id: string; name: string }[] }, { data: [] as { agency_id: string; status: string; plan: string | null }[] }];
  const nameOf = new Map((agencies ?? []).map((a) => [a.id as string, (a.name as string) || "Unnamed agency"]));
  const subOf = new Map((subs ?? []).map((s) => [s.agency_id as string, s]));

  return {
    affiliate: { ...(affiliate as AffiliateRecord), commission_pct: Number(affiliate.commission_pct) },
    agencies: (referrals ?? []).map((r) => ({
      agencyId: r.agency_id as string,
      name: nameOf.get(r.agency_id as string) ?? "Deleted agency",
      capturedAt: r.captured_at as string,
      landingPath: (r.landing_path as string | null) ?? null,
      firstPaidAt: (r.first_paid_at as string | null) ?? null,
      subscriptionStatus: (subOf.get(r.agency_id as string)?.status as string | undefined) ?? null,
      plan: (subOf.get(r.agency_id as string)?.plan as string | null | undefined) ?? null,
    })),
    commissions: ((commissions ?? []) as CommissionRecord[]).map((c) => ({
      ...c,
      net_amount_minor: Number(c.net_amount_minor),
      commission_amount_minor: Number(c.commission_amount_minor),
      commission_pct: Number(c.commission_pct),
      agencyName: nameOf.get(c.agency_id) ?? "Deleted agency",
    })),
  };
}

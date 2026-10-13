// Affiliate commissions from Paddle events. Called by the Paddle webhook
// (app/api/webhooks/paddle) AFTER its billing work has succeeded, and built so
// it can never fail that webhook: every function catches its own errors,
// reports them, and returns an outcome. A lost commission is recoverable by
// hand from the admin page; a webhook that keeps failing is not.
//
// Service-role only (migration 0043). Pure arithmetic lives in ./rules.
import type { SupabaseClient } from "@supabase/supabase-js";
import { captureException } from "@/lib/monitoring";
import {
  applyRefund,
  commissionEligible,
  commissionMinor,
  formatMinor,
  netAmountMinor,
  payableAfter,
  type CommissionRow,
} from "./rules";

// The parts of a Paddle transaction this needs (TransactionNotification).
export type CommissionTransaction = {
  id: string;
  currencyCode?: string | null;
  billedAt?: string | null;
  createdAt?: string | null;
  details?: { totals?: { subtotal?: string | null; discount?: string | null; currencyCode?: string | null } | null } | null;
};

export type CommissionOutcome =
  | "recorded"
  | "no_referral"
  | "zero_amount"
  | "unreadable_totals"
  | "not_eligible"
  | "failed";

/**
 * Records the commission a referred agency's payment earns, once per Paddle
 * transaction (the insert is ON CONFLICT DO NOTHING on paddle_transaction_id,
 * so a replayed webhook is a no-op).
 */
export async function recordCommission(
  admin: SupabaseClient,
  args: { agencyId: string; tx: CommissionTransaction; now?: Date }
): Promise<CommissionOutcome> {
  const { agencyId, tx } = args;
  const now = args.now ?? new Date();
  try {
    const { data: referral, error: refError } = await admin
      .from("referrals")
      .select("affiliate_id, first_paid_at, first_transaction_id")
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (refError) throw new Error(refError.message);
    if (!referral) return "no_referral";

    // Pre-tax, after discounts: details.totals.subtotal − details.totals.discount
    // (rules.netAmountMinor). A trial checkout completes at zero and earns
    // nothing; the first real charge days later is the first payment.
    const net = netAmountMinor(tx.details?.totals);
    if (net === null) return "unreadable_totals";
    if (net <= 0) return "zero_amount";
    const currency = (tx.currencyCode || tx.details?.totals?.currencyCode || "").toUpperCase();
    if (!currency) return "unreadable_totals";

    const paidAt = new Date(tx.billedAt || tx.createdAt || now.toISOString());

    // The agency's first payment anchors first_payment and the recurring
    // window. Earliest wins, so a first payment whose webhook arrives after a
    // later one still becomes the anchor.
    let first = referral.first_paid_at
      ? { transactionId: referral.first_transaction_id as string, paidAt: new Date(referral.first_paid_at as string) }
      : null;
    if (!first || paidAt.getTime() < first.paidAt.getTime()) {
      const { error } = await admin
        .from("referrals")
        .update({ first_paid_at: paidAt.toISOString(), first_transaction_id: tx.id })
        .eq("agency_id", agencyId);
      if (error) throw new Error(error.message);
      first = { transactionId: tx.id, paidAt };
    }

    const { data: affiliate, error: affError } = await admin
      .from("affiliates")
      .select("id, commission_pct, commission_type, recurring_months")
      .eq("id", referral.affiliate_id)
      .maybeSingle();
    if (affError) throw new Error(affError.message);
    if (!affiliate) return "no_referral";

    const eligible = commissionEligible(
      {
        commissionType: affiliate.commission_type === "first_payment" ? "first_payment" : "recurring",
        recurringMonths: (affiliate.recurring_months as number | null) ?? null,
      },
      { transactionId: tx.id, paidAt },
      first
    );
    if (!eligible) return "not_eligible";

    const pct = Number(affiliate.commission_pct);
    const { error } = await admin.from("affiliate_commissions").upsert(
      {
        affiliate_id: affiliate.id,
        agency_id: agencyId,
        paddle_transaction_id: tx.id,
        currency,
        net_amount_minor: net,
        // The rate now, snapshotted: a later rate change doesn't rewrite it.
        commission_pct: pct,
        commission_amount_minor: commissionMinor(net, pct),
        status: "pending",
        payable_after: payableAfter(now).toISOString(),
      },
      { onConflict: "paddle_transaction_id", ignoreDuplicates: true }
    );
    if (error) throw new Error(error.message);
    return "recorded";
  } catch (err) {
    captureException(err, { area: "affiliates.commission", agencyId, transactionId: tx.id });
    return "failed";
  }
}

// The parts of a Paddle adjustment this needs (AdjustmentNotification).
export type CommissionAdjustment = {
  id: string;
  action: string; // refund | credit | chargeback | …
  type?: string | null; // full | partial
  status: string; // pending_approval | approved | rejected | reversed
  transactionId: string;
  totals?: { subtotal?: string | null } | null;
};

export type AdjustmentOutcome = "applied" | "ignored" | "no_commission" | "already_applied" | "failed";

/**
 * Applies an approved refund or chargeback to the commission of the
 * transaction it adjusts (rules.applyRefund): partial amounts reduce the
 * commission proportionally, a full one reverses it, and either sets
 * clawback_needed if the commission was already paid out. Each adjustment id
 * is applied once, so adjustment.created and adjustment.updated for the same
 * approved refund — or a replay — never count twice.
 *
 * Not acted on: credits (account balance, not money returned), pending or
 * rejected refunds, and chargeback reversals (money coming back is restored by
 * hand from the admin page; it is rare and needs a judgement call).
 */
export async function applyAdjustment(admin: SupabaseClient, adj: CommissionAdjustment, now: Date = new Date()): Promise<AdjustmentOutcome> {
  try {
    if (adj.status !== "approved") return "ignored";
    if (adj.action !== "refund" && adj.action !== "chargeback") return "ignored";

    // Adjustment totals.subtotal is the pre-tax amount returned — the same
    // basis the commission was computed on.
    const refunded = Number(adj.totals?.subtotal ?? "0");
    const full = adj.type === "full";
    if (!full && !(Number.isInteger(refunded) && refunded > 0)) return "ignored";

    // Two tries: the update is conditional on the row not having changed since
    // it was read, so concurrent adjustments for one transaction can't
    // overwrite each other.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: row, error } = await admin
        .from("affiliate_commissions")
        .select("id, currency, status, net_amount_minor, commission_pct, commission_amount_minor, refunded_net_minor, clawback_needed, applied_adjustment_ids, note, reversed_at")
        .eq("paddle_transaction_id", adj.transactionId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return "no_commission";

      const current: CommissionRow = {
        status: row.status,
        net_amount_minor: Number(row.net_amount_minor),
        commission_pct: row.commission_pct,
        commission_amount_minor: Number(row.commission_amount_minor),
        refunded_net_minor: Number(row.refunded_net_minor),
        clawback_needed: Boolean(row.clawback_needed),
        applied_adjustment_ids: (row.applied_adjustment_ids as string[] | null) ?? [],
      };
      const outcome = applyRefund(current, { id: adj.id, refundedNetMinor: refunded, full });
      if (!outcome) return "already_applied";

      const what = `${adj.action === "chargeback" ? "Chargeback" : "Refund"} ${adj.id}: ${outcome.reversed ? "commission reversed" : "commission reduced"}`;
      const claw = outcome.clawbackMinor > 0 ? `; recover ${formatMinor(outcome.clawbackMinor, row.currency as string)} already paid out` : "";
      const { data: updated, error: updateError } = await admin
        .from("affiliate_commissions")
        .update({
          status: outcome.status,
          commission_amount_minor: outcome.commission_amount_minor,
          refunded_net_minor: outcome.refunded_net_minor,
          clawback_needed: outcome.clawback_needed,
          applied_adjustment_ids: outcome.applied_adjustment_ids,
          reversed_at: outcome.reversed ? (row.reversed_at as string | null) ?? now.toISOString() : row.reversed_at,
          note: [row.note, `${what}${claw}.`].filter(Boolean).join(" "),
        })
        .eq("id", row.id)
        .eq("refunded_net_minor", current.refunded_net_minor)
        .eq("status", current.status)
        .select("id");
      if (updateError) throw new Error(updateError.message);
      if (updated && updated.length > 0) return "applied";
    }
    throw new Error(`commission for ${adj.transactionId} kept changing; adjustment ${adj.id} not applied`);
  } catch (err) {
    captureException(err, { area: "affiliates.adjustment", adjustmentId: adj.id, transactionId: adj.transactionId });
    return "failed";
  }
}

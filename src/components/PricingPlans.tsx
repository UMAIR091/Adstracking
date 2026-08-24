"use client";

// The public pricing grid — used by both the marketing landing section
// (#pricing) and /pricing.
//
// Deliberately mirrors the signed-in billing page (components/BillingPlans):
// one interval toggle drives every card, the price is quoted per the cycle that
// is actually charged (/month or /quarter) rather than a per-month equivalent
// with a "billed every 3 months" caveat underneath, and the Free plan sits in
// the grid as a first-class card instead of a footnote band. A visitor
// comparing this page with the billing page they land on after signing up
// should recognise the same layout and the same numbers.
//
// Signed-in visitors are routed to the dashboard billing page with their pick
// preserved (Paddle checkout runs there as an overlay); everyone else lands on
// /signup with the same plan choice carried through.
//
// Amounts are never hardcoded here: the server fetches them from Paddle and
// passes them in, so the page can only ever show what Paddle will charge.

import { useState } from "react";
import Link from "next/link";
import { Check, X, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FREE_LIMITS, PAID_FEATURES } from "@/lib/billing/config";
import { cn } from "@/lib/utils";

// Serializable pricing prepared by the server (see lib/billing/prices.ts).
export type PlanPricingView = {
  id: string;
  name: string;
  maxClients: number;
  monthly: string | null; // formatted 1-month price, e.g. "$49"
  quarterly: string | null; // formatted 3-month total, e.g. "$132.30"
  trialAvailable: boolean;
};

const INTERVAL_LABEL = { monthly: "Monthly", quarterly: "Every 3 months" } as const;
/** The unit a price is quoted per, e.g. "$132.30/quarter" — same as billing. */
const INTERVAL_UNIT = { monthly: "month", quarterly: "quarter" } as const;

// Identical on purpose — the only difference between paid plans is client
// count + price.
const IN_EVERY_PLAN = PAID_FEATURES;

// The Free plan's allowances come from FREE_LIMITS, the same constant
// lib/billing/limits enforces, so the page cannot advertise an allowance the
// app doesn't actually give. The two crosses are the line between free and
// paying — stating them is what keeps the card honest now that it sits in the
// grid looking exactly like the plans beside it.
const FREE_INCLUDED = [
  `${FREE_LIMITS.maxClients} active client`,
  `${FREE_LIMITS.maxIntegrationsPerClient} data sources`,
  `${FREE_LIMITS.maxReports} report a month`,
  "Full white-label branding",
];
const FREE_MISSING = ["Automated delivery", "AI-written insights"];

export function PricingPlans({
  plans,
  headlineSavingPct,
  trialDays,
  showAssurances = true,
}: {
  plans: PlanPricingView[];
  headlineSavingPct: number | null;
  /** Paid-plan trial length; 0 when no trial prices are configured. */
  trialDays: number;
  /** The landing page carries its own footnotes, so it hides these. */
  showAssurances?: boolean;
}) {
  const [interval, setInterval] = useState<"monthly" | "quarterly">("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const unit = INTERVAL_UNIT[interval];
  const trialOffered = trialDays > 0 && plans.some((p) => p.trialAvailable);

  // Paddle checkout runs as an overlay on the dashboard billing page, so this
  // marketing page only needs to route the visitor to the right place with
  // their pick preserved: signed-in customers go straight to billing, everyone
  // else signs up first and lands there afterwards. The probe is a GET with no
  // side effects — it never creates a Paddle transaction.
  async function startCheckout(planId: string) {
    setBusy(planId);
    const query = `plan=${planId}&interval=${interval}`;
    try {
      const res = await fetch("/api/billing/checkout", { method: "GET" });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.authenticated) {
        window.location.href = `/dashboard/billing?${query}`;
        return;
      }
    } catch {
      /* fall through to signup */
    }
    window.location.href = `/signup?${query}`;
  }

  return (
    <div>
      {/* Billing interval toggle */}
      <div
        role="group"
        aria-label="Billing interval"
        className="mx-auto flex w-fit items-center justify-center gap-1 rounded-full border border-ink-200 bg-surface p-1 text-sm"
      >
        {(["monthly", "quarterly"] as const).map((iv) => (
          <button
            key={iv}
            type="button"
            onClick={() => setInterval(iv)}
            aria-pressed={interval === iv}
            className={cn(
              "focus-ring rounded-full px-4 py-1.5 font-medium transition-colors",
              interval === iv ? "bg-brand-solid text-white" : "text-ink-500 hover:text-ink-800"
            )}
          >
            {INTERVAL_LABEL[iv]}
            {iv === "quarterly" && headlineSavingPct != null && headlineSavingPct > 0 && (
              <span className={cn("ml-1.5 text-xs", interval === iv ? "text-white/80" : "text-success-600")}>
                save {headlineSavingPct}%
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Plan cards. Free leads: it is the offer that asks for nothing, so it
          is the first thing a visitor should be able to say yes to. */}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Free */}
        <Card className="flex flex-col">
          <CardContent className="flex flex-1 flex-col p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-ink-900">Free</p>
              <Badge variant="muted">No card</Badge>
            </div>
            {/* Free is free on either cycle, so it is always quoted per month —
                "$0/quarter" would only make the toggle look broken. */}
            <p className="mt-3">
              <span className="text-3xl font-semibold text-ink-900">$0</span>{" "}
              <span className="text-sm text-ink-500">/month</span>
            </p>
            <p className="mt-1 text-sm text-ink-500">
              Up to {FREE_LIMITS.maxClients} active client — no card, no time limit.
            </p>
            <ul className="mb-6 mt-5 flex-1 space-y-2.5 text-sm text-ink-700">
              {FREE_INCLUDED.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-success-500" aria-hidden /> {f}
                </li>
              ))}
              {FREE_MISSING.map((f) => (
                <li key={f} className="flex gap-2 text-ink-400">
                  <X size={16} className="mt-0.5 shrink-0" aria-hidden /> {f}
                </li>
              ))}
            </ul>
            <Button variant="outline" asChild>
              <Link href="/signup">Start on Free</Link>
            </Button>
            <p className="mt-2 text-center text-xs text-ink-500">Free forever. Upgrade whenever you need more.</p>
          </CardContent>
        </Card>

        {/* Paid plans */}
        {plans.map((plan) => {
          // Comes straight from Paddle; a dash when the catalog couldn't be
          // reached, never a guessed or stale number.
          const price = interval === "quarterly" ? plan.quarterly : plan.monthly;
          const featured = plan.id === "pro";
          const showTrial = trialOffered && plan.trialAvailable;

          return (
            <Card key={plan.id} className={cn("flex flex-col", featured && "border-2 border-brand-500 shadow-md")}>
              <CardContent className="flex flex-1 flex-col p-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink-900">{plan.name}</p>
                  {featured && <Badge>Most popular</Badge>}
                </div>
                <p className="mt-3" aria-live="polite">
                  <span className="text-3xl font-semibold text-ink-900">{price ?? "—"}</span>{" "}
                  <span className="text-sm text-ink-500">/{unit}</span>
                </p>
                <p className="mt-1 text-sm text-ink-500">
                  Up to {plan.maxClients} active client{plan.maxClients === 1 ? "" : "s"} — every feature included.
                </p>
                <ul className="mb-6 mt-5 flex-1 space-y-2.5 text-sm text-ink-700">
                  {IN_EVERY_PLAN.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-success-500" aria-hidden /> {f}
                    </li>
                  ))}
                </ul>

                <Button
                  variant={featured ? "default" : "outline"}
                  disabled={busy !== null}
                  onClick={() => startCheckout(plan.id)}
                  aria-label={`Choose the ${plan.name} plan`}
                >
                  {busy === plan.id
                    ? "Opening checkout…"
                    : showTrial
                      ? `Start ${trialDays}-day free trial`
                      : `Choose ${plan.name}`}
                </Button>
                {showTrial && (
                  <p className="mt-2 text-center text-xs text-ink-500">
                    Free for {trialDays} days, then {price ?? "—"}/{unit}. Cancel before it ends and you won&apos;t be
                    charged.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Assurances. The guarantee is stated with its actual scope — 3 days
          from the FIRST payment — so it cannot be read as an open-ended refund
          window or as applying to renewals. */}
      {showAssurances && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-600">
            <span className="inline-flex items-center gap-1.5">
              <Check size={15} className="text-success-500" aria-hidden /> Cancel anytime
            </span>
            {trialOffered && (
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={15} className="text-success-500" aria-hidden /> {trialDays}-day free trial
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-success-500" aria-hidden /> 100% money-back guarantee
            </span>
          </div>
          <p className="max-w-xl text-center text-xs leading-relaxed text-ink-500">
            Prices in USD, billed by Paddle. The money-back guarantee covers your{" "}
            <span className="font-medium text-ink-500">first payment only</span>, refundable in full if you ask within 3
            days of that charge. Cancelling later stops future renewals but does not refund past ones.
          </p>
        </div>
      )}
    </div>
  );
}

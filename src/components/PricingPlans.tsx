"use client";

// The public pricing grid on /pricing (the landing page shows a compact plan
// strip instead and links here).
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
  /** Hide the guarantee row when the page carries its own footnotes. */
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
        className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-full bg-site-band p-1 text-sm"
      >
        {(["monthly", "quarterly"] as const).map((iv) => (
          <button
            key={iv}
            type="button"
            onClick={() => setInterval(iv)}
            aria-pressed={interval === iv}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-2.5 font-semibold transition-colors sm:px-5",
              interval === iv ? "bg-site-cta text-site-cta-fg" : "text-site-fg hover:text-site-accent"
            )}
          >
            {INTERVAL_LABEL[iv]}
            {iv === "quarterly" && headlineSavingPct != null && headlineSavingPct > 0 && (
              <span className={cn("ml-1.5", interval === iv ? "text-site-cta-fg/80" : "text-site-accent")}>
                save {headlineSavingPct}%
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Plan cards. Free leads: it is the offer that asks for nothing, so it
          is the first thing a visitor should be able to say yes to. */}
      <div className="mt-[52px] grid items-stretch gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
        {/* Free */}
        <div className="flex flex-col gap-4 rounded-[18px] border border-site-line-strong p-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xl font-bold">Free</h3>
            <span className="whitespace-nowrap rounded-full bg-site-band px-[9px] py-1 font-site-mono text-[11px]">No card</span>
          </div>
          {/* Free is free on either cycle, so it is always quoted per month —
              "$0/quarter" would only make the toggle look broken. */}
          <p>
            <span className="text-[40px] font-extrabold leading-none tracking-[-0.04em]">$0</span>{" "}
            <span className="text-site-muted">/month</span>
          </p>
          <p className="text-sm leading-[1.45] text-site-muted">
            Up to {FREE_LIMITS.maxClients} active client — no card, no time limit.
          </p>
          <ul className="flex flex-1 flex-col gap-2 text-sm">
            {FREE_INCLUDED.map((f) => (
              <li key={f} className="flex gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-site-accent" aria-hidden /> {f}
              </li>
            ))}
            {FREE_MISSING.map((f) => (
              <li key={f} className="flex gap-2 text-site-muted">
                <X size={16} className="mt-0.5 shrink-0" aria-hidden /> {f}
              </li>
            ))}
          </ul>
          <Link
            href="/signup"
            className="whitespace-nowrap rounded-full border border-site-fg px-4 py-[13px] text-center font-semibold transition-colors hover:bg-site-cta hover:text-site-cta-fg"
          >
            Start on Free
          </Link>
          <p className="text-xs leading-[1.45] text-site-muted">Free forever. Upgrade whenever you need more.</p>
        </div>

        {/* Paid plans. The popular plan is the inverted dark card. */}
        {plans.map((plan) => {
          // Comes straight from Paddle; a dash when the catalog couldn't be
          // reached, never a guessed or stale number.
          const price = interval === "quarterly" ? plan.quarterly : plan.monthly;
          const featured = plan.id === "pro";
          const showTrial = trialOffered && plan.trialAvailable;
          const quiet = featured ? "text-site-dark-muted" : "text-site-muted";

          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col gap-4 rounded-[18px] border p-6",
                featured ? "border-site-dark bg-site-dark text-site-dark-fg" : "border-site-line-strong"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-bold">{plan.name}</h3>
                {featured && (
                  <span className="whitespace-nowrap rounded-full bg-site-dark-accent px-[9px] py-1 font-site-mono text-[11px] text-site-dark">
                    Most popular
                  </span>
                )}
              </div>
              <p aria-live="polite">
                <span className="text-[40px] font-extrabold leading-none tracking-[-0.04em]">{price ?? "—"}</span>{" "}
                <span className={quiet}>/{unit}</span>
              </p>
              <p className={cn("text-sm leading-[1.45]", quiet)}>
                Up to {plan.maxClients} active client{plan.maxClients === 1 ? "" : "s"} — every feature included.
              </p>
              <ul className="flex flex-1 flex-col gap-2 text-sm">
                {IN_EVERY_PLAN.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check
                      size={16}
                      className={cn("mt-0.5 shrink-0", featured ? "text-site-dark-accent" : "text-site-accent")}
                      aria-hidden
                    />{" "}
                    {f}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled={busy !== null}
                onClick={() => startCheckout(plan.id)}
                aria-label={`Choose the ${plan.name} plan`}
                className={cn(
                  "whitespace-nowrap rounded-full px-4 py-[13px] text-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  featured
                    ? "bg-site-dark-accent text-site-dark hover:bg-site-dark-fg"
                    : "bg-site-cta text-site-cta-fg hover:bg-site-cta-hover hover:text-site-cta-hover-fg"
                )}
              >
                {busy === plan.id
                  ? "Opening checkout…"
                  : showTrial
                    ? `Start ${trialDays}-day free trial`
                    : `Choose ${plan.name}`}
              </button>
              {showTrial && (
                <p className={cn("text-xs leading-[1.45]", quiet)}>
                  Free for {trialDays} days, then {price ?? "—"}/{unit}. Cancel before it ends and you won&apos;t be
                  charged.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Assurances. The guarantee is stated with its actual scope — the
          14-day money-back window on the FIRST payment (see /refund) — so it
          cannot be read as an open-ended refund window or as applying to
          renewals. */}
      {showAssurances && (
        <div className="mt-9 flex flex-col items-center gap-3.5">
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2.5 font-semibold">
            <span className="inline-flex items-center gap-1.5">
              <Check size={16} className="text-site-accent" aria-hidden /> Cancel anytime
            </span>
            {trialOffered && (
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={16} className="text-site-accent" aria-hidden /> {trialDays}-day free trial
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={16} className="text-site-accent" aria-hidden /> 100% money-back guarantee
            </span>
          </div>
          <p className="max-w-[720px] text-center text-[13px] leading-[1.55] text-site-muted">
            Prices in USD, billed by Paddle. The money-back guarantee covers your{" "}
            <span className="font-medium">first payment only</span>, refundable in full if you ask within 14
            days of that charge. Cancelling later stops future renewals but does not refund past ones.
          </p>
        </div>
      )}
    </div>
  );
}

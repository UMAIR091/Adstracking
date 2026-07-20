"use client";

// Public pricing plans with a monthly/annual billing toggle.
// Signed-in visitors are routed to the dashboard billing page with their pick
// preserved (Paddle checkout runs there as an overlay); everyone else lands on
// /signup with the same plan choice carried through.
//
// Amounts are never hardcoded here: the server fetches them from Paddle and
// passes them in, so the page can only ever show what Paddle will charge.

import { useState } from "react";
import Link from "next/link";
import { Check, Zap, Rocket, Building2, Users, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAID_FEATURES } from "@/lib/billing/config";

// Serializable pricing prepared by the server (see lib/billing/prices.ts).
export type PlanPricingView = {
  id: string;
  name: string;
  maxClients: number;
  monthly: string | null;        // formatted, e.g. "$49"
  annual: string | null;         // formatted yearly total, e.g. "$470"
  annualPerMonth: string | null; // formatted, e.g. "$39"
  annualSavingPct: number | null;
  trialAvailable: boolean;
};

const ICONS: Record<string, typeof Zap> = { pro: Zap, pro_plus: Rocket, growth: Building2, agency: Building2 };

// Identical on purpose — the only difference between plans is client count + price.
const IN_EVERY_PLAN = PAID_FEATURES;

export function PricingPlans({
  plans,
  headlineSavingPct,
  trialDays,
  freeTrialDays,
}: {
  plans: PlanPricingView[];
  headlineSavingPct: number | null;
  /** Paid-plan trial length; 0 when no trial prices are configured. */
  trialDays: number;
  /** The separate no-card free trial offered on signup. */
  freeTrialDays: number;
}) {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const annual = interval === "annual";
  const trialOffered = trialDays > 0 && plans.some((p) => p.trialAvailable);

  const PRICING_PLANS = plans.map((p) => ({
    ...p,
    icon: ICONS[p.id] ?? Zap,
    clients: `Up to ${p.maxClients} active client${p.maxClients === 1 ? "" : "s"}`,
    featured: p.id === "pro",
  }));

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
      <div className="flex flex-col items-center gap-2">
        <div
          role="group"
          aria-label="Billing period"
          className="inline-flex items-center rounded-full border border-ink-200 bg-surface-muted p-1"
        >
          {(
            [
              { key: "monthly", label: "Monthly" },
              { key: "annual", label: "Yearly" },
            ] as const
          ).map((opt) => {
            const active = interval === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={active}
                onClick={() => setInterval(opt.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                  active ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
                }`}
              >
                {opt.label}
                {opt.key === "annual" && headlineSavingPct != null && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      active ? "bg-brand-50 text-brand-700" : "bg-ink-200/60 text-ink-600"
                    }`}
                  >
                    −{headlineSavingPct}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {headlineSavingPct != null && (
          <p className="text-xs text-ink-400" aria-live="polite">
            {annual
              ? `Billed once a year — save up to ${headlineSavingPct}%.`
              : `Switch to yearly billing and save up to ${headlineSavingPct}%.`}
          </p>
        )}
      </div>

      {/* The no-card free trial available on signup, distinct from the paid
          plans' short trial advertised on each card below. */}
      <div className="mt-10 flex flex-col items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-brand-50/50 px-6 py-5 sm:flex-row">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 ring-1 ring-inset ring-brand-100">
            <Sparkles size={18} aria-hidden />
          </div>
          <div>
            <p className="font-semibold text-ink-900">{freeTrialDays}-Day Free Trial</p>
            <p className="mt-0.5 text-sm text-ink-600">
              Try every feature free for {freeTrialDays} days — no card required. Pick a plan whenever you&apos;re ready.
            </p>
          </div>
        </div>
        <Button asChild size="lg" variant="outline" className="w-full shrink-0 sm:w-auto">
          <Link href="/signup">Start free trial</Link>
        </Button>
      </div>

      {/* Plan cards */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {PRICING_PLANS.map((plan) => {
          const Icon = plan.icon;
          const featured = "featured" in plan && plan.featured;
          // Both figures come straight from Paddle; "—" when the catalog
          // couldn't be reached, never a guessed or stale number.
          const price = annual ? plan.annualPerMonth : plan.monthly;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl bg-white p-6 ${
                featured
                  ? "border-2 border-brand-500 shadow-lg shadow-brand-500/10"
                  : "border border-ink-200 shadow-sm"
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}

              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    featured ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-600"
                  }`}
                >
                  <Icon size={17} aria-hidden />
                </div>
                <p className="font-semibold text-ink-900">{plan.name}</p>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-500">Same complete toolkit — {plan.clients.toLowerCase()}.</p>

              <div className="mt-5" aria-live="polite">
                <p className="flex items-baseline gap-1.5">
                  {annual && plan.monthly && (
                    <span className="text-lg font-medium text-ink-300 line-through" aria-hidden>
                      {plan.monthly}
                    </span>
                  )}
                  <span className="text-4xl font-semibold tracking-tight text-ink-900">{price ?? "—"}</span>
                  <span className="text-sm text-ink-400">/mo</span>
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  {/* The exact Paddle yearly total, not the rounded per-month
                      figure multiplied out — those disagree by a few dollars. */}
                  {annual
                    ? plan.annual
                      ? `Billed annually — ${plan.annual}/yr${plan.annualSavingPct ? ` · save ${plan.annualSavingPct}%` : ""}`
                      : "Billed annually"
                    : "Billed monthly · Cancel anytime"}
                </p>
                {trialOffered && plan.trialAvailable && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <Sparkles size={12} aria-hidden />
                    {trialDays}-day free trial
                  </p>
                )}
              </div>

              <p
                className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                  featured ? "bg-brand-50 text-brand-700" : "bg-surface-muted text-ink-800"
                }`}
              >
                <Users size={15} className="shrink-0" aria-hidden />
                {plan.clients}
              </p>

              <Button
                size="lg"
                variant={featured ? "default" : "outline"}
                className="mt-5 w-full"
                disabled={busy !== null}
                onClick={() => startCheckout(plan.id)}
                aria-label={`Choose the ${plan.name} plan`}
              >
                {busy === plan.id ? "Opening checkout…" : `Choose ${plan.name}`}
              </Button>

              <ul className="mt-5 space-y-2 border-t border-ink-100 pt-5">
                {IN_EVERY_PLAN.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-600">
                    <Check size={15} className="mt-0.5 shrink-0 text-brand-500" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Assurances. The guarantee is stated with its actual scope — 3 days
          from the FIRST payment — so it can't be read as an open-ended
          refund window or as applying to renewals. */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-600">
          <span className="inline-flex items-center gap-1.5">
            <Check size={15} className="text-emerald-500" aria-hidden /> Cancel anytime
          </span>
          {trialOffered && (
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={15} className="text-emerald-500" aria-hidden /> {trialDays}-day free trial
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={15} className="text-emerald-500" aria-hidden /> 100% money-back guarantee
          </span>
        </div>
        <p className="max-w-xl text-center text-xs leading-relaxed text-ink-400">
          Prices in USD, billed by Paddle. The money-back guarantee covers your{" "}
          <span className="font-medium text-ink-500">first payment only</span>, refundable in full if you ask within 3
          days of that charge. Cancelling later stops future renewals but does not refund past ones.
        </p>
      </div>
    </div>
  );
}

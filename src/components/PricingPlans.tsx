"use client";

// Public pricing plans with a monthly/annual billing toggle.
// Every CTA goes through the Lemon Squeezy checkout flow: signed-in users
// with a configured variant are sent straight to the hosted checkout;
// everyone else lands on /signup with their plan choice preserved.

import { useState } from "react";
import { Check, Zap, Rocket, Building2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_DISPLAY, PAID_FEATURES, TRIAL_DAYS } from "@/lib/billing/config";

const ANNUAL_DISCOUNT = 0.2;

// Icons + featured flag are presentation-only; prices, names and client caps all
// come from PLAN_DISPLAY (single source of truth in billing/config.ts).
const ICONS: Record<string, typeof Zap> = { pro: Zap, pro_plus: Rocket, growth: Building2, agency: Building2 };
const PRICING_PLANS = PLAN_DISPLAY.map((p) => ({
  id: p.id,
  name: p.name,
  icon: ICONS[p.id] ?? Zap,
  monthly: p.priceMonthly,
  clients: `Up to ${p.maxClients} active client${p.maxClients === 1 ? "" : "s"}`,
  featured: p.id === "pro",
}));

// Identical on purpose — the only difference between plans is client count + price.
const IN_EVERY_PLAN = PAID_FEATURES;

export function annualMonthly(monthly: number): number {
  return Math.round(monthly * (1 - ANNUAL_DISCOUNT));
}

export function PricingPlans() {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const annual = interval === "annual";

  // Lemon Squeezy checkout flow. Signed-in users with a purchasable variant
  // get the hosted checkout URL; anyone else (not signed in, or billing not
  // configured yet) continues to signup with the chosen plan preserved, and
  // completes checkout from the dashboard billing page.
  async function startCheckout(planId: string) {
    setBusy(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, interval }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.url) {
        window.location.href = body.url as string;
        return;
      }
    } catch {
      /* fall through to signup */
    }
    window.location.href = `/signup?plan=${planId}&interval=${interval}`;
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
                {opt.key === "annual" && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      active ? "bg-brand-50 text-brand-700" : "bg-ink-200/60 text-ink-600"
                    }`}
                  >
                    −20%
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-ink-400" aria-live="polite">
          {annual ? "Billed once a year — save 20% on every plan." : "Switch to yearly billing and save 20%."}
        </p>
      </div>

      {/* Plan cards */}
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {PRICING_PLANS.map((plan) => {
          const Icon = plan.icon;
          const featured = "featured" in plan && plan.featured;
          const price = annual ? annualMonthly(plan.monthly) : plan.monthly;
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
                  {annual && (
                    <span className="text-lg font-medium text-ink-300 line-through" aria-hidden>
                      ${plan.monthly}
                    </span>
                  )}
                  <span className="text-4xl font-semibold tracking-tight text-ink-900">${price}</span>
                  <span className="text-sm text-ink-400">/mo</span>
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  {annual
                    ? `Billed annually — $${(price * 12).toLocaleString("en-US")}/yr`
                    : "Billed monthly · Cancel anytime"}
                </p>
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
                aria-label={`Start your ${TRIAL_DAYS}-day free trial on the ${plan.name} plan`}
              >
                {busy === plan.id ? "Opening checkout…" : `Start ${TRIAL_DAYS}-Day Free Trial`}
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

      <p className="mt-6 text-center text-sm text-ink-400">
        Prices in USD. Every plan starts with a {TRIAL_DAYS}-day free trial — no card required.
      </p>
    </div>
  );
}

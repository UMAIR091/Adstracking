import type { Metadata } from "next";
import Link from "next/link";
import { Check, TrendingUp } from "lucide-react";
import { Brand } from "@/components/Brand";
import { SiteFooter } from "@/components/SiteFooter";
import { PricingPlans } from "@/components/PricingPlans";
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: `Pricing — ${COMPANY.product}`,
  description:
    "Simple, transparent pricing for white-label client reporting. Every plan includes every feature — upgrade only when you need more active clients. Start with a 14-day free trial, no card required.",
};

const INCLUDED = [
  "Unlimited reports & scheduled deliveries",
  "Google Search Console, GA4 & Meta Ads connectors",
  "AI-written executive summaries, insights & recommendations",
  "White-label branded reports (your logo, colours, domain)",
  "Branded PDF export & shareable report links",
  "Automated weekly / monthly / quarterly email delivery",
  "Every future integration, included as it ships",
  "Email support",
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label={`${COMPANY.product} home`}><Brand /></Link>
          <nav className="flex items-center gap-5 text-sm text-ink-500">
            <Link href="/contact" className="hover:text-ink-800">Support</Link>
            <Link href="/login" className="hover:text-ink-800">Sign in</Link>
            <Button asChild size="sm"><Link href="/signup">Start free</Link></Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-14 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-brand-600">Pricing</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
            Every plan includes every feature.
            <span className="block text-ink-500 sm:mt-1">Upgrade only when you need more active clients.</span>
          </h1>
          <p className="mt-4 text-lg text-ink-500">
            No feature gates, no per-client fees, no surprises. Pick the plan that fits your roster today — change it
            anytime as you grow.
          </p>
        </div>

        <div className="mt-10 sm:mt-12">
          <PricingPlans />
        </div>

        {/* The one shared feature list — identical across all plans. */}
        <div className="mx-auto mt-14 max-w-3xl rounded-2xl border border-ink-200 bg-surface-subtle p-6 sm:p-8">
          <p className="text-sm font-semibold text-ink-900">Everything, in every plan</p>
          <p className="mt-1 text-sm text-ink-500">
            From Starter to Enterprise, the feature set is identical. The only thing that changes is how many active
            clients you can report on.
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {INCLUDED.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-ink-600">
                <Check size={16} className="mt-0.5 flex-shrink-0 text-brand-500" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Competitor comparison note */}
        <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-4 rounded-2xl border border-brand-100 bg-brand-50/40 p-6 sm:flex-row sm:items-start sm:p-8">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
            <TrendingUp size={19} aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-900">Why growing agencies switch to ReportFlow</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
              Per-client tools raise your bill every time you win a client: at 20 clients, AgencyAnalytics runs
              ≈ $240/mo and Whatagraph starts around $249/mo. On ReportFlow, 20 clients is the $99 Agency plan —
              with every feature included. Simple, transparent pricing that doesn&apos;t punish you for growing.
            </p>
            <p className="mt-2 text-xs text-ink-400">
              Competitor pricing reflects public rates at time of writing and may change.
            </p>
          </div>
        </div>

        {/* Billing details — clear terms for a subscription product. */}
        <div className="mx-auto mt-14 max-w-3xl">
          <h2 className="text-lg font-semibold text-ink-900">Billing & cancellation</h2>
          <dl className="mt-4 space-y-4">
            {[
              { q: "How does the free trial work?", a: "You get 14 days of full access with no card required. Add a card only when you decide to continue." },
              { q: "What counts as an active client?", a: "An active client is a client you're currently set up to report on in your workspace. Only that number differs between plans — the features never do." },
              { q: "Do all plans really include every feature?", a: "Yes. Starter gets the same AI insights, white-label branding, scheduling, and integrations as Enterprise. You upgrade for more active clients, nothing else." },
              { q: "Can I change plans later?", a: "Yes. Upgrade or downgrade anytime from your billing settings — as your client roster grows or shrinks, your plan can follow." },
              { q: "How does annual billing work?", a: "Pay for a year upfront and save 20% on any plan. You can switch between monthly and annual billing from your billing settings." },
              { q: "Can I cancel anytime?", a: "Yes. Cancel from your billing settings at any time and you won't be charged again. You keep access until the end of the current billing period." },
              { q: "Do you offer refunds?", a: <>See our <Link href="/refund" className="font-medium text-brand-600 hover:underline">Refund &amp; Cancellation Policy</Link> for full details.</> },
              { q: "Which currencies and taxes?", a: "Prices are in USD. Payments and any applicable sales tax / VAT are handled securely by our payment provider, who acts as merchant of record." },
            ].map((item) => (
              <div key={item.q}>
                <dt className="text-sm font-medium text-ink-800">{item.q}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-500">{item.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm text-ink-400">
            By subscribing you agree to our{" "}
            <Link href="/terms" className="font-medium text-brand-600 hover:underline">Terms of Service</Link>,{" "}
            <Link href="/refund" className="font-medium text-brand-600 hover:underline">Refund Policy</Link>, and{" "}
            <Link href="/privacy" className="font-medium text-brand-600 hover:underline">Privacy Policy</Link>.
          </p>
        </div>

        <div className="mt-14 text-center">
          <Button asChild size="lg"><Link href="/signup">Start Your 14-Day Free Trial</Link></Button>
          <p className="mt-2 text-sm text-ink-400">No card required · Every feature on every plan · Cancel anytime</p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

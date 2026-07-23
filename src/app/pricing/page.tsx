import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  CreditCard,
  EyeOff,
  Lock,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { PLAN_DISPLAY, PAID_TRIAL_DAYS, TRIAL_DAYS } from "@/lib/billing/config";
import { getPlanPricing, headlineSavingPct, type PlanPricing } from "@/lib/billing/prices";
import { SiteFooter } from "@/components/SiteFooter";
import { PricingPlans } from "@/components/PricingPlans";
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/company";

const PAGE_TITLE = `Pricing — ${COMPANY.product}`;
const PAGE_DESCRIPTION =
  "Simple, transparent pricing for white-label client reporting. Every plan includes every feature — upgrade only when you need more active clients. New accounts begin with a 7-day free trial, no card required.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: `${COMPANY.website}/pricing` },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: `${COMPANY.website}/pricing`,
    siteName: COMPANY.product,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

// ── Plans — derived from the single source of truth (billing/config.ts) ──

// Plan metadata only — amounts live in Paddle and are fetched per render.
type PlanColumn = { id: string; name: string; clients: string; featured?: boolean };
const PLAN_COLUMNS: readonly PlanColumn[] = PLAN_DISPLAY.map((p) => ({
  id: p.id,
  name: p.name,
  clients: String(p.maxClients),
  featured: p.id === "pro",
}));
const CLIENT_LIMITS: readonly string[] = PLAN_DISPLAY.map((p) => String(p.maxClients));

// ── Feature comparison table. Identical everywhere on purpose:
//    the client limit is the only row that changes. ──

type FeatureRow = { label: string; values?: readonly string[] };
const FEATURE_GROUPS: { heading: string; rows: FeatureRow[] }[] = [
  {
    heading: "Usage",
    rows: [
      { label: "Active clients", values: CLIENT_LIMITS },
      { label: "Reports per month", values: ["Unlimited", "Unlimited", "Unlimited", "Unlimited"] },
      { label: "Scheduled report deliveries", values: ["Unlimited", "Unlimited", "Unlimited", "Unlimited"] },
      { label: "Report history & archive" },
    ],
  },
  {
    heading: "Integrations",
    rows: [
      { label: "Google Search Console" },
      { label: "Google Analytics 4" },
      { label: "Meta Ads" },
      { label: "Every future integration, as it ships" },
    ],
  },
  {
    heading: "AI reporting",
    rows: [
      { label: "AI-written executive summaries" },
      { label: "AI insights & recommendations" },
      { label: "One-click insight regeneration" },
    ],
  },
  {
    heading: "White-label & delivery",
    rows: [
      { label: "Your logo & brand colours on every report" },
      { label: "Branded PDF export" },
      { label: "Shareable client report links" },
      { label: "Automated weekly / monthly / quarterly email delivery" },
    ],
  },
  {
    heading: "Billing & support",
    rows: [
      { label: "Email support" },
      { label: "Cancel anytime" },
    ],
  },
];

// Values marked "Unlimited" render as text; undefined renders a check —
// which is the point: every feature row is a check in every column.

// ── FAQs (rendered on-page and mirrored into FAQPage JSON-LD) ──

const FAQS: { q: string; a: string }[] = [
  {
    q: "How does the 7-day free trial work?",
    a: "New accounts begin with 7 days of full access — every feature, no card required. Choose a plan whenever you're ready to continue. If you do nothing, the trial simply ends; you're never charged automatically.",
  },
  {
    q: "What counts as an active client?",
    a: "An active client is a client you're currently set up to report on in your workspace. Only that number differs between plans — the features never do.",
  },
  {
    q: "What happens when I reach my active client limit?",
    a: "Nothing breaks. Your existing clients and reports keep working; to add more active clients, upgrade to the next plan. You can also archive a client you no longer report on to free up a slot.",
  },
  {
    q: "Do all plans really include every feature?",
    a: "Yes. Pro gets the same AI insights, white-label branding, scheduling, PDF export and integrations as Agency. You upgrade for more active clients — nothing else.",
  },
  {
    q: "How do upgrades work?",
    a: "Upgrade anytime from your billing settings. The change takes effect immediately and the payment provider prorates the difference, so you only pay for what you use.",
  },
  {
    q: "How do downgrades work?",
    a: "Downgrade anytime from your billing settings. If your active client count is above the new plan's limit, archive clients until you're within it — your data and report history are never deleted.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your billing settings in a couple of clicks — no emails, no phone calls. You keep full access until the end of the period you've already paid for, and you won't be charged again.",
  },
  {
    q: "Do you offer refunds?",
    a: "Because every account starts with a free trial, we encourage you to test everything before paying. For billing mistakes or exceptional cases, see our Refund & Cancellation Policy — we handle requests case by case and aim to be fair.",
  },
  {
    q: "How does annual billing work?",
    a: "Pay for a year upfront at a discount — the exact annual price and saving are shown on each plan above. You can switch between monthly and annual billing from your billing settings at any time.",
  },
  {
    q: "What payment methods do you accept?",
    a: "Payments are processed securely by Paddle, our merchant of record. Major credit and debit cards (Visa, Mastercard, American Express, Discover) and PayPal are accepted, and any applicable sales tax or VAT is handled for you.",
  },
  {
    q: "What currency are prices in?",
    a: "All prices are in USD. Local taxes such as VAT or sales tax are calculated at checkout by the payment provider where applicable.",
  },
];

// ── Structured data for SEO ──

function jsonLd(pricing: PlanPricing[]) {
  // Structured data must match the visible price, so it is built from the same
  // Paddle-sourced amounts. Plans whose price couldn't be read are omitted
  // rather than published with a placeholder.
  const priced = pricing.filter((p) => p.monthly);
  const offers = priced.map((p) => ({
    "@type": "Offer",
    name: `${p.name} plan`,
    price: String((p.monthly!.amount / 100).toFixed(2)),
    priceCurrency: p.monthly!.currency,
    description: `Up to ${p.maxClients} active clients — every feature included.`,
    url: `${COMPANY.website}/pricing`,
  }));
  const amounts = priced.map((p) => p.monthly!.amount / 100);
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: COMPANY.product,
      description: COMPANY.tagline,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: COMPANY.website,
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: priced[0]?.monthly?.currency ?? "USD",
        lowPrice: amounts.length ? String(Math.min(...amounts).toFixed(2)) : undefined,
        highPrice: amounts.length ? String(Math.max(...amounts).toFixed(2)) : undefined,
        offerCount: String(offers.length),
        offers,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
}

// Amounts are read from Paddle. Revalidating hourly keeps the page effectively
// static for SEO while guaranteeing the displayed price is one Paddle honours.
export const revalidate = 3600;

export default async function PricingPage() {
  const pricing = await getPlanPricing();
  const saving = headlineSavingPct(pricing);
  const priceById = new Map<string, PlanPricing>(pricing.map((p) => [p.id as string, p]));
  const trialOffered = pricing.some((p) => p.trialAvailable);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <script
        type="application/ld+json"
        // Structured data is static, server-rendered content — safe to inline.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(pricing)) }}
      />

      <header className="border-b border-slate-100">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label={`${COMPANY.product} home`}><Brand /></Link>
          <nav className="flex items-center gap-5 text-sm text-ink-500" aria-label="Main">
            <Link href="/contact" className="hover:text-ink-800">Support</Link>
            <Link href="/login" className="hover:text-ink-800">Sign in</Link>
            <Button asChild size="sm"><Link href="/signup">Start free</Link></Button>
          </nav>
        </div>
      </header>

      <main className="w-full flex-1">
        {/* ── Hero ── */}
        <section className="mx-auto max-w-6xl px-5 pt-14 sm:pt-20">
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
            <PricingPlans
              plans={pricing.map((p) => ({
                id: p.id,
                name: p.name,
                maxClients: p.maxClients,
                monthly: p.monthly?.formatted ?? null,
                annual: p.annual?.formatted ?? null,
                annualPerMonth: p.annualPerMonth?.formatted ?? null,
                annualSavingPct: p.annualSavingPct,
                trialAvailable: p.trialAvailable,
              }))}
              headlineSavingPct={saving}
              trialDays={trialOffered ? PAID_TRIAL_DAYS : 0}
              freeTrialDays={TRIAL_DAYS}
            />
          </div>
        </section>

        {/* ── Feature comparison table ── */}
        <section aria-labelledby="compare-heading" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="compare-heading" className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              Compare plans, feature by feature
            </h2>
            <p className="mt-3 text-ink-500">
              Spoiler: the rows are identical. The only thing that changes is the number of active clients.
            </p>
          </div>

          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
              <caption className="sr-only">
                Feature comparison across the Pro, Pro Plus, Growth and Agency plans. All features are identical;
                only the active client limit differs.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-[32%] p-4 text-left font-medium text-ink-500">Features</th>
                  {PLAN_COLUMNS.map((p) => (
                    <th
                      key={p.name}
                      scope="col"
                      className={`p-4 text-center ${
                        p.featured ? "rounded-t-xl bg-brand-500 text-white" : "text-ink-700"
                      }`}
                    >
                      <span className="block font-semibold">{p.name}</span>
                      <span className={`mt-0.5 block text-xs font-normal ${p.featured ? "text-brand-100" : "text-ink-400"}`}>
                        {priceById.get(p.id)?.monthly?.formatted ?? "—"}/mo
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_GROUPS.map((group) => (
                  <FeatureGroupRows key={group.heading} group={group} />
                ))}
                <tr>
                  <td className="p-4" />
                  {PLAN_COLUMNS.map((p) => (
                    <td key={p.name} className={`p-4 text-center ${p.featured ? "rounded-b-xl border-x border-b border-brand-100 bg-brand-50/40" : ""}`}>
                      <Button asChild size="sm" variant={p.featured ? "default" : "outline"}>
                        <Link href={`/signup?plan=${p.id}`} aria-label={`Choose the ${p.name} plan`}>Choose {p.name}</Link>
                      </Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-center text-xs text-ink-400">
            All prices in USD. Cancel anytime.
          </p>
        </section>

        {/* ── Transparent pricing vs competitors ── */}
        <section aria-labelledby="transparent-heading" className="bg-slate-50/60 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-brand-600">Transparent by design</p>
              <h2 id="transparent-heading" className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
                Flat pricing that doesn&apos;t punish you for growing
              </h2>
              <p className="mt-3 text-ink-500">
                Most reporting tools charge per client or per report, so your bill climbs every time you win business.
                ReportFlow is a flat monthly price — win as many clients as your plan holds, pay the same.
              </p>
            </div>

            <div className="mx-auto mt-10 grid max-w-4xl gap-5 sm:grid-cols-3">
              {[
                {
                  name: "Per-client tools",
                  example: "AgencyAnalytics",
                  price: "≈ $240/mo",
                  detail: "at 20 clients — and the bill grows with every client you add.",
                  highlight: false,
                },
                {
                  name: "ReportFlow",
                  example: "Agency plan",
                  price: "$149/mo",
                  detail: "flat, for up to 25 active clients — every feature included.",
                  highlight: true,
                },
                {
                  name: "Per-report platforms",
                  example: "Whatagraph",
                  price: "from ~$249/mo",
                  detail: "with feature tiers and annual contracts to negotiate.",
                  highlight: false,
                },
              ].map((c) => (
                <div
                  key={c.name}
                  className={`flex flex-col rounded-2xl p-6 text-center ${
                    c.highlight
                      ? "border-2 border-brand-500 bg-white shadow-lg shadow-brand-500/10"
                      : "border border-slate-200 bg-white"
                  }`}
                >
                  <p className={`text-sm font-semibold ${c.highlight ? "text-brand-600" : "text-ink-500"}`}>{c.name}</p>
                  <p className="mt-0.5 text-xs text-ink-400">{c.example}</p>
                  <p className={`mt-3 text-3xl font-semibold tracking-tight ${c.highlight ? "text-brand-600" : "text-ink-900"}`}>
                    {c.price}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">{c.detail}</p>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-4 rounded-2xl border border-brand-100 bg-brand-50/40 p-6 sm:flex-row sm:items-start sm:p-8">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
                <TrendingUp size={19} aria-hidden />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">The math at 20 clients</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                  Per-client tools raise your bill every time you win a client: at 20 clients, AgencyAnalytics runs
                  ≈ $240/mo and Whatagraph starts around $249/mo. On ReportFlow, 25 clients is the $149 Growth plan —
                  with every feature included. That&apos;s money back in your margin, every month.
                </p>
                <p className="mt-2 text-xs text-ink-400">
                  Competitor pricing reflects public rates at time of writing and may change.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQs ── */}
        <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
          <div className="text-center">
            <p className="text-sm font-semibold text-brand-600">FAQ</p>
            <h2 id="faq-heading" className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              Billing questions, answered
            </h2>
          </div>
          <div className="mt-8 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-6">
            {FAQS.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-ink-800 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-500 transition-transform duration-150 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-2 pr-10 text-sm leading-relaxed text-ink-500">
                  {item.q === "Do you offer refunds?" ? (
                    <>
                      Because every account starts with a free trial, we encourage you to test everything before paying.
                      For billing mistakes or exceptional cases, see our{" "}
                      <Link href="/refund" className="font-medium text-brand-600 hover:underline">
                        Refund &amp; Cancellation Policy
                      </Link>{" "}
                      — we handle requests case by case and aim to be fair.
                    </>
                  ) : (
                    item.a
                  )}
                </p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-ink-400">
            By subscribing you agree to our{" "}
            <Link href="/terms" className="font-medium text-brand-600 hover:underline">Terms of Service</Link>,{" "}
            <Link href="/refund" className="font-medium text-brand-600 hover:underline">Refund Policy</Link>, and{" "}
            <Link href="/privacy" className="font-medium text-brand-600 hover:underline">Privacy Policy</Link>.
          </p>
        </section>

        {/* ── Trust, security & payments ── */}
        <section aria-label="Trust, security and accepted payment methods" className="mx-auto max-w-6xl px-5 pb-16 sm:pb-20">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-12">
            <div className="mx-auto max-w-2xl text-center">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                <ShieldCheck size={16} aria-hidden /> Trust &amp; security
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
                Pay safely. Sleep soundly.
              </h2>
            </div>
            <div className="mt-8 grid gap-6 text-center sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: CreditCard, t: "Secure checkout", x: "Payments handled by Paddle, our PCI-DSS compliant merchant of record. Card details never touch our servers." },
                { icon: Lock, t: "Encrypted everywhere", x: "All traffic over TLS; OAuth tokens encrypted at rest with AES-256." },
                { icon: EyeOff, t: "Read-only access", x: "ReportFlow can never change anything in your Google or Meta accounts." },
                { icon: BadgeCheck, t: "No lock-in", x: "Cancel anytime in two clicks. Your data is yours — export or delete it whenever you like." },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.t}>
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon size={20} aria-hidden />
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-ink-900">{s.t}</h3>
                    <p className="mx-auto mt-1 max-w-[16rem] text-xs leading-relaxed text-ink-500">{s.x}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-label="Accepted payment methods">
              {["Visa", "Mastercard", "American Express", "Discover", "PayPal"].map((m) => (
                <span key={m} className="rounded-lg border border-slate-200 bg-surface-subtle px-3 py-1.5 text-xs font-medium text-ink-600">
                  {m}
                </span>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-ink-400">
              Prices in USD · Sales tax / VAT handled at checkout · Read more in{" "}
              <Link href="/security" className="font-medium text-brand-600 hover:underline">Data &amp; Security</Link>
            </p>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="bg-slate-50/60 py-16 text-center sm:py-20">
          <div className="mx-auto max-w-2xl px-5">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              Send your first white-label report today
            </h2>
            <p className="mt-3 text-ink-500">
              Start free for 7 days with every feature unlocked. If it doesn&apos;t save you a reporting weekend, walk
              away — no card, no commitment.
            </p>
            <div className="mt-6">
              <Button asChild size="lg"><Link href="/signup">Start Your 7-Day Free Trial</Link></Button>
            </div>
            <p className="mt-3 text-sm text-ink-400">No card required · Every feature on every plan · Cancel anytime</p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

// Renders one feature group: a heading row plus one row per feature.
// The Pro column keeps the highlighted treatment from the table header.
function FeatureGroupRows({ group }: { group: { heading: string; rows: FeatureRow[] } }) {
  return (
    <>
      <tr>
        <th
          scope="colgroup"
          colSpan={PLAN_COLUMNS.length + 1}
          className="border-b border-slate-200 px-4 pb-2 pt-6 text-left text-xs font-semibold uppercase tracking-wide text-ink-400"
        >
          {group.heading}
        </th>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.label}>
          <th scope="row" className="border-b border-slate-100 p-4 text-left font-medium text-ink-700">
            {row.label}
          </th>
          {PLAN_COLUMNS.map((p, i) => (
            <td
              key={p.name}
              className={`border-b p-4 text-center ${
                p.featured ? "border-x border-brand-100 bg-brand-50/40" : "border-slate-100"
              }`}
            >
              {row.values ? (
                <span className={`text-sm font-semibold ${p.featured ? "text-brand-700" : "text-ink-800"}`}>
                  {row.values[i]}
                </span>
              ) : (
                <>
                  <Check size={17} className={`mx-auto ${p.featured ? "text-brand-600" : "text-brand-500"}`} aria-hidden />
                  <span className="sr-only">Included</span>
                </>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

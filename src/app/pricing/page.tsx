import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { PLAN_DISPLAY, PAID_TRIAL_DAYS } from "@/lib/billing/config";
import { getPlanPricing, headlineSavingPct, planForClients, type PlanPricing } from "@/lib/billing/prices";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { CtaPanel, Eyebrow, sitePage } from "@/components/site/ui";
import { PricingPlans } from "@/components/PricingPlans";
import { COMPANY } from "@/lib/company";

const PAGE_TITLE = `Pricing — ${COMPANY.product}`;
const PAGE_DESCRIPTION =
  "Simple, transparent pricing for white-label client reporting. Every plan includes every feature — upgrade only when you need more active clients. New accounts begin with a 3-day free trial.";

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
    q: "How does the free trial work?",
    a: "Choose a plan and you get 3 days of full access to every feature before the first charge. Cancel any time inside those 3 days and you won't be billed.",
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
    a: "Yes — a 14-day money-back guarantee on your first payment. If you're not satisfied, request a refund within 14 days of that charge and we'll refund it in full. See our Refund & Cancellation Policy for details.",
  },
  {
    q: "How does 3-month billing work?",
    a: "Pay for 3 months upfront at a discount — the exact quarterly price and saving are shown on each plan above. You can switch between monthly and 3-month billing from your billing settings at any time.",
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

const h2 = "text-[clamp(28px,4vw,44px)] font-bold leading-[1.08] tracking-[-0.035em] [text-wrap:balance]";
const inlineLink = "font-semibold text-site-fg underline hover:text-site-accent";

export default async function PricingPage() {
  const pricing = await getPlanPricing();
  const saving = headlineSavingPct(pricing);
  const priceById = new Map<string, PlanPricing>(pricing.map((p) => [p.id as string, p]));
  const trialOffered = pricing.some((p) => p.trialAvailable);
  // The plan quoted against competitors "at 20 clients", priced from Paddle.
  const at20 = planForClients(pricing, 20);
  return (
    <div className={`${sitePage} flex flex-col`}>
      <script
        type="application/ld+json"
        // Structured data is static, server-rendered content — safe to inline.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(pricing)) }}
      />

      <SiteHeader />

      <main className="w-full flex-1">
        {/* ── Hero ── */}
        {/* Wider than the rest of the page: the grid carries five cards now
            that Free is one of them. */}
        <section className="mx-auto w-full max-w-[1240px] px-6 pb-10 pt-16 sm:pt-20">
          <div className="text-center">
            <Eyebrow className="!mb-[18px]">Pricing</Eyebrow>
            <h1 className="mx-auto max-w-[820px] text-[clamp(38px,5.5vw,66px)] font-extrabold leading-none tracking-[-0.045em] [text-wrap:balance]">
              Every plan includes every feature. Upgrade only when you need more active clients.
            </h1>
            <p className="mx-auto mt-[22px] max-w-[620px] text-lg leading-[1.55] text-site-muted">
              No feature gates, no per-client fees, no surprises. Pick the plan that fits your roster today — change it
              anytime as you grow.
            </p>
          </div>

          <div className="mt-8">
            <PricingPlans
              plans={pricing.map((p) => ({
                id: p.id,
                name: p.name,
                maxClients: p.maxClients,
                monthly: p.monthly?.formatted ?? null,
                quarterly: p.quarterly?.formatted ?? null,
                trialAvailable: p.trialAvailable,
              }))}
              headlineSavingPct={saving}
              trialDays={trialOffered ? PAID_TRIAL_DAYS : 0}
            />
          </div>
        </section>

        {/* ── Feature comparison table ── */}
        <section aria-labelledby="compare-heading" className="mx-auto w-full max-w-[1100px] px-6 py-20">
          <h2 id="compare-heading" className={h2}>
            Compare plans, feature by feature
          </h2>
          <p className="mb-8 mt-3 text-[17px] text-site-muted">
            Spoiler: the rows are identical. The only thing that changes is the number of active clients.
          </p>

          {/* Scrolls sideways under 720px rather than squeezing five columns.
              `relative` makes this box the containing block of the sr-only
              "Included" labels, so they scroll with the table instead of
              widening the page. */}
          <div className="relative overflow-x-auto rounded-2xl border border-site-line-strong">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">
                Feature comparison across the Pro, Pro Plus, Growth and Agency plans. All features are identical;
                only the active client limit differs.
              </caption>
              <thead>
                <tr className="bg-site-band">
                  <th scope="col" className="w-[36%] px-5 py-[18px] text-left text-[15px] font-bold">Features</th>
                  {PLAN_COLUMNS.map((p) => (
                    <th key={p.name} scope="col" className="px-3 py-[18px] text-left text-[15px] font-bold">
                      <span className="block">{p.name}</span>
                      <span className="mt-0.5 block text-[13px] font-normal text-site-muted">
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
                <tr className="border-t border-site-line bg-site-card">
                  <td className="px-5 py-4" />
                  {PLAN_COLUMNS.map((p) => (
                    <td key={p.name} className="px-3 py-4">
                      <Link
                        href={`/signup?plan=${p.id}`}
                        aria-label={`Choose the ${p.name} plan`}
                        className={`inline-block whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                          p.featured
                            ? "bg-site-cta text-site-cta-fg hover:bg-site-cta-hover hover:text-site-cta-hover-fg"
                            : "border border-site-fg hover:bg-site-cta hover:text-site-cta-fg"
                        }`}
                      >
                        Choose {p.name}
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3.5 text-[13px] text-site-muted">
            All prices in USD. Cancel anytime.
          </p>
        </section>

        {/* ── Transparent pricing vs competitors ── */}
        <section aria-labelledby="transparent-heading" className="bg-site-band">
          <div className="mx-auto w-full max-w-[1100px] px-6 py-[100px]">
            <Eyebrow>Transparent by design</Eyebrow>
            <h2 id="transparent-heading" className={`${h2} max-w-[640px]`}>
              Flat pricing that doesn&apos;t punish you for growing
            </h2>
            <p className="mt-4 max-w-[680px] text-[17px] leading-[1.6] text-site-muted">
              Most reporting tools charge per client or per report, so your bill climbs every time you win business.
              Anavyst is a flat monthly price — win as many clients as your plan holds, pay the same.
            </p>

            <div className="mt-10 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
              {[
                {
                  name: "Per-client tools",
                  example: "AgencyAnalytics",
                  price: "≈ $240/mo",
                  detail: "at 20 clients — and the bill grows with every client you add.",
                  highlight: false,
                },
                {
                  name: "Anavyst",
                  example: at20 ? `${at20.name} plan` : "Every plan",
                  price: at20 ? `${at20.monthly.formatted}/mo` : "Flat",
                  detail: at20
                    ? `flat, for up to ${at20.maxClients} active clients — every feature included.`
                    : "every feature included.",
                  highlight: true,
                },
                {
                  name: "Per-report platforms",
                  example: "Whatagraph",
                  price: "from ~$249/mo",
                  detail: "with feature tiers and long-term contracts to negotiate.",
                  highlight: false,
                },
              ].map((c) => (
                <div
                  key={c.name}
                  className={`rounded-2xl p-6 ${c.highlight ? "bg-site-dark text-site-dark-fg" : "bg-site-page"}`}
                >
                  <p className={`font-site-mono text-xs ${c.highlight ? "text-site-dark-accent" : "text-site-muted"}`}>{c.name}</p>
                  <p className="mt-2.5 font-bold">{c.example}</p>
                  <p className="mt-1.5 text-[34px] font-extrabold leading-tight tracking-[-0.04em]">{c.price}</p>
                  <p className={`mt-1.5 text-sm ${c.highlight ? "text-site-dark-muted" : "text-site-muted"}`}>{c.detail}</p>
                </div>
              ))}
            </div>

            <h3 className="mb-2 mt-10 text-xl font-bold">The math at 20 clients</h3>
            <p className="max-w-[760px] text-base leading-[1.6] text-site-muted">
              Per-client tools raise your bill every time you win a client: at 20 clients, AgencyAnalytics runs
              ≈ $240/mo and Whatagraph starts around $249/mo.
              {at20 && (
                <>
                  {" "}On Anavyst, {at20.maxClients} clients is the {at20.monthly.formatted} {at20.name} plan — with every
                  feature included.
                </>
              )}{" "}
              That&apos;s money back in your margin, every month.
            </p>
            <p className="mt-3.5 text-xs text-site-muted">
              Competitor pricing reflects public rates at time of writing and may change.
            </p>
          </div>
        </section>

        {/* ── FAQs ── */}
        <section aria-labelledby="faq-heading" className="mx-auto w-full max-w-[860px] px-6 py-[100px]">
          <Eyebrow>FAQ</Eyebrow>
          <h2 id="faq-heading" className={`${h2} mb-9`}>
            Billing questions, answered
          </h2>
          {/* One open at a time: details sharing a `name` form a native
              exclusive accordion. */}
          {FAQS.map((item) => (
            <details key={item.q} name="billing-faq" className="group border-t border-site-line-strong py-[22px] last-of-type:border-b">
              <summary className="flex cursor-pointer list-none justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <span className="font-site-mono text-xl leading-none text-site-accent" aria-hidden>
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <p className="mt-3 max-w-[720px] text-base leading-[1.65] text-site-muted">
                {item.q === "Do you offer refunds?" ? (
                  <>
                    Yes — a 14-day money-back guarantee on your first payment. If you&apos;re not satisfied, request a
                    refund within 14 days of that charge and we&apos;ll refund it in full. See our{" "}
                    <Link href="/refund" className={inlineLink}>
                      Refund &amp; Cancellation Policy
                    </Link>{" "}
                    for details.
                  </>
                ) : (
                  item.a
                )}
              </p>
            </details>
          ))}
        </section>

        {/* ── Trust, security & payments ── */}
        <section aria-label="Trust, security and accepted payment methods" className="mx-auto w-full max-w-[1100px] px-6 pb-[100px]">
          <Eyebrow>Trust &amp; security</Eyebrow>
          <h2 className={h2}>Pay safely. Sleep soundly.</h2>
          <div className="mt-10 grid gap-8 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {[
              { t: "Secure checkout", x: "Payments handled by Paddle, our PCI-DSS compliant merchant of record. Card details never touch our servers." },
              { t: "Encrypted everywhere", x: "All traffic over TLS; OAuth tokens encrypted at rest with AES-256." },
              { t: "Read-only access", x: "Anavyst can never change anything in your Google or Meta accounts." },
              { t: "No lock-in", x: "Cancel anytime in two clicks. Your data is yours — export or delete it whenever you like." },
            ].map((s) => (
              <div key={s.t} className="border-t-2 border-site-fg pt-[18px]">
                <h3 className="mb-2 text-lg font-bold">{s.t}</h3>
                <p className="text-[15px] leading-[1.55] text-site-muted">{s.x}</p>
              </div>
            ))}
          </div>
          <div className="mt-9 flex flex-wrap gap-2" role="list" aria-label="Accepted payment methods">
            {["Visa", "Mastercard", "American Express", "Discover", "PayPal"].map((m) => (
              <span key={m} role="listitem" className="rounded-lg border border-site-line-strong px-3.5 py-2 text-[13px] font-semibold">
                {m}
              </span>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-site-muted">
            Prices in USD · Sales tax / VAT handled at checkout · Read more in{" "}
            <Link href="/security" className={inlineLink}>Data &amp; Security</Link>
          </p>
          <p className="mt-2 text-[13px] text-site-muted">
            By subscribing you agree to our{" "}
            <Link href="/terms" className={inlineLink}>Terms of Service</Link>,{" "}
            <Link href="/refund" className={inlineLink}>Refund Policy</Link>, and{" "}
            <Link href="/privacy" className={inlineLink}>Privacy Policy</Link>.
          </p>
        </section>

        {/* ── Final CTA ── */}
        <CtaPanel
          title="Send your first white-label report today"
          body={
            <>
              Start free for 3 days with every feature unlocked. If it doesn&apos;t save you a reporting weekend, walk
              away — cancel in one click.
            </>
          }
          cta={{ href: "/signup", label: <>Start Your {PAID_TRIAL_DAYS}-Day Free Trial</> }}
          footnote="3-day free trial · Every feature on every plan · Cancel anytime"
        />
      </main>

      <SiteFooter />
    </div>
  );
}

// Renders one feature group: a mono heading row plus one row per feature.
function FeatureGroupRows({ group }: { group: { heading: string; rows: FeatureRow[] } }) {
  return (
    <>
      <tr className="border-t border-site-line bg-site-tile">
        <th
          scope="colgroup"
          colSpan={PLAN_COLUMNS.length + 1}
          className="px-5 py-[13px] text-left font-site-mono text-xs font-medium uppercase text-site-muted"
        >
          {group.heading}
        </th>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.label} className="border-t border-site-line bg-site-card">
          <th scope="row" className="px-5 py-[13px] text-left font-normal">
            {row.label}
          </th>
          {PLAN_COLUMNS.map((p, i) => (
            <td key={p.name} className="px-3 py-[13px] text-site-accent">
              {row.values ? (
                <span className="font-semibold">{row.values[i]}</span>
              ) : (
                <>
                  <Check size={17} aria-hidden />
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

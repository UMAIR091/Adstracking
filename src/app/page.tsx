import type { Metadata } from "next";
import Link from "next/link";
import {
  Search, BarChart3, Facebook, Linkedin, Music, Megaphone, MapPin, LineChart, Instagram, Image as ImageIcon,
} from "lucide-react";
import { isLive } from "@/lib/integrations/registry";
import { cheapestMonthly, getPlanPricing, headlineSavingPct, planForClients, type PlanPricing } from "@/lib/billing/prices";
import { FREE_LIMITS, PAID_TRIAL_DAYS } from "@/lib/billing/config";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import {
  CheckList, CtaPanel, Eyebrow, H2, btnOutline, btnPrimary, container, sitePage, textLink,
} from "@/components/site/ui";

// The "from" price in the search and share descriptions is the cheapest live
// Paddle price, like every other figure on the page.
export async function generateMetadata(): Promise<Metadata> {
  const from = cheapestMonthly(await getPlanPricing());
  const fromLine = from ? `, from ${from.formatted}/mo` : "";
  return {
    title: "Anavyst — White-label client reports on autopilot, written by AI",
    description: `The client-reporting tool for marketing agencies. Connect Search Console, GA4 and Meta Ads, and send beautiful white-label reports with AI-written insights — every feature on every plan${fromLine}, live in 5 minutes.`,
    alternates: { canonical: "/" },
    openGraph: {
      title: "Anavyst — White-label client reports on autopilot",
      description: `Connect a client's marketing data and send agency-grade, AI-written reports under your brand. Every feature on every plan${fromLine}.`,
    },
  };
}

// Curated marketing shortlist. Which of these show "Live" is decided by the
// registry at render time (credentials + LIVE_INTEGRATIONS), so the public page
// can never drift out of step with what the app actually offers.
const MARKETING_INTEGRATIONS = [
  { id: "gsc", n: "Search Console", icon: Search },
  { id: "ga4", n: "Google Analytics 4", icon: BarChart3 },
  { id: "meta_ads", n: "Meta Ads", icon: Facebook },
  { id: "instagram", n: "Instagram", icon: Instagram },
  { id: "microsoft_ads", n: "Microsoft Ads", icon: LineChart },
  { id: "tiktok_ads", n: "TikTok Ads", icon: Music },
  { id: "pinterest_ads", n: "Pinterest Ads", icon: ImageIcon },
  { id: "google_ads", n: "Google Ads", icon: Megaphone },
  { id: "linkedin_ads", n: "LinkedIn Ads", icon: Linkedin },
  { id: "gbp", n: "Business Profile", icon: MapPin },
];

// Copy that quotes a price is built from the live Paddle amounts, so prose
// can't drift out of step with the plan cards after a price change.
// "40 clients costs $329/mo", from the largest plan's live limit and price.
function scaleLine(pricing: PlanPricing[]): string {
  const top = pricing[pricing.length - 1];
  return top?.monthly ? `${top.maxClients} clients costs ${top.monthly.formatted}/mo` : "large rosters stay flat-priced";
}

function faqs(pricing: PlanPricing[], savingPct: number | null) {
  const topLine = scaleLine(pricing);
  const tiers = pricing
    .filter((p) => p.monthly)
    .map((p) => `${p.maxClients} (${p.monthly!.formatted}/mo)`)
    .join(", ");

  return [
  {
    q: "How is Anavyst different from AgencyAnalytics or Whatagraph?",
    a: `Three things. Pricing that stays simple as you grow — every plan includes every feature, and ${topLine}, while per-client tools charge ~$240/mo for just 20 clients. AI-written insights on every report, not just charts. And setup measured in minutes: connect a source, pick an account, generate. We deliberately skip the 100-widget dashboard maze and do the reporting part exceptionally well.`,
  },
  {
    q: "How does pricing work?",
    a: `Every plan includes every feature — unlimited reports, AI insights, full white-label. The only difference is how many active clients you can report on: ${tiers}.${savingPct ? ` Paying every 3 months saves up to ${savingPct}%.` : ""} There are no per-client fees or feature gates.`,
  },
  {
    q: "Which data sources are live today?",
    a: "The Integrations section shows exactly what you can connect right now — availability is expanding as each source clears provider review. Every plan includes every integration as it ships, at no extra cost.",
  },
  {
    q: "Is it actually white-label?",
    a: "Yes. Your logo, brand colour and footer appear on every report, PDF and email, and once you verify your own sending domain, email comes from your address too. Reports and PDFs carry your brand, not ours.",
  },
  {
    q: "Can reports go out automatically?",
    a: "Yes — set a weekly, monthly, or quarterly schedule per client and Anavyst generates the report, writes the insights, and emails it with a branded PDF attached. You can also send test runs to yourself first.",
  },
  {
    q: "Is my clients' data safe?",
    a: "Access is read-only — Anavyst can never change anything in your Google or Meta accounts. Connection tokens are encrypted with AES-256, every workspace is isolated at the database level, and your clients' data is only ever used to generate your reports — never sold or used for advertising. You can disconnect any source and delete its data instantly.",
  },
  {
    q: "How long does setup take?",
    a: "About five minutes: create an account, connect a client's Search Console or GA4, pick a property, and generate your first AI-written report. No onboarding calls, no dashboard building.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Paid plans can be cancelled in one click — you keep access until the end of the period you've paid for.",
  },
  ];
}

// Structured data: product + FAQ rich results. The advertised offer price is
// the cheapest live Paddle price, so rich results can't quote a stale figure.
function jsonLd(pricing: PlanPricing[], savingPct: number | null) {
  const cheapest = pricing.map((p) => p.monthly).filter((m): m is NonNullable<typeof m> => m != null)[0];
  return {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Anavyst",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "White-label client reporting for marketing agencies with AI-written insights. Every plan includes every feature; plans differ only by number of active clients.",
      ...(cheapest
        ? { offers: { "@type": "Offer", price: String((cheapest.amount / 100).toFixed(2)), priceCurrency: cheapest.currency } }
        : {}),
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs(pricing, savingPct).map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
  };
}

// Prices come from Paddle; hourly revalidation keeps the landing page static
// enough for SEO while never showing an amount Paddle wouldn't charge.
export const revalidate = 3600;

// Vertical rhythm shared by the full-width sections.
const sectionY = "py-[96px] lg:py-[110px]";

export default async function LandingPage() {
  const pricing = await getPlanPricing();
  const savingPct = headlineSavingPct(pricing);
  const liveMarketingCount = MARKETING_INTEGRATIONS.filter((i) => isLive(i.id)).length;
  const from = cheapestMonthly(pricing);
  const at20 = planForClients(pricing, 20);
  return (
    <div className={sitePage}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(pricing, savingPct)) }} />

      <SiteHeader />

      <main>
        {/* ── 1. Hero ── */}
        <section className={`${container} grid items-center gap-14 pb-12 pt-16 sm:pt-20 [grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))]`}>
          <div>
            <p className="mb-7 inline-flex max-w-fit items-center gap-2 rounded-[10px] bg-site-accent-soft px-3 py-[7px] font-site-mono text-[13px] leading-[1.4] text-site-accent">
              <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-site-accent" aria-hidden />
              The reporting tool for agencies that hate reporting
            </p>
            <h1 className="m-0 text-[clamp(42px,6vw,76px)] font-extrabold leading-[0.98] tracking-[-0.045em] [text-wrap:balance]">
              Client reports that used to take all day, sent in minutes.
            </h1>
            <p className="mt-[26px] max-w-[540px] text-[19px] leading-[1.55] text-site-muted [text-wrap:pretty]">
              Connect a client&apos;s marketing accounts once. Anavyst pulls the data, writes the insights with AI, and
              delivers a beautiful report under your brand — on schedule, every time.
            </p>
            <div className="mt-[34px] flex flex-wrap gap-3">
              <Link href="/signup" className={btnPrimary}>Start your free trial</Link>
              <Link href="/sample-report" className={btnOutline}>View a sample report</Link>
            </div>
            <p className="mt-[22px] flex flex-wrap gap-x-[18px] gap-y-2 font-site-mono text-xs text-site-muted">
              <span>{PAID_TRIAL_DAYS}-day free trial</span><span aria-hidden>·</span>
              <span>Every feature on every plan</span><span aria-hidden>·</span>
              <span>Live in 5 minutes</span><span aria-hidden>·</span>
              <span>Cancel anytime</span>
            </p>
          </div>
          <HeroMock />
        </section>

        {/* ── 2. Stat strip ── */}
        <section aria-label="Highlights" className={`${container} pb-[96px] pt-6`}>
          <div className="grid border-y border-site-line-strong [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {[
              { v: "5 min", l: "from signup to first report" },
              { v: `${from?.formatted ?? "—"}/mo`, l: "to start — every feature included" },
              { v: `${liveMarketingCount} live`, l: `integrations, ${MARKETING_INTEGRATIONS.length - liveMarketingCount} more coming` },
              { v: "100%", l: "your brand, not ours" },
            ].map((s) => (
              <div key={s.l} className="px-1 py-7">
                <p className="text-[40px] font-extrabold leading-tight tracking-[-0.04em]">{s.v}</p>
                <p className="mt-1 text-sm text-site-muted">{s.l}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 3. How it works ── */}
        <section id="how" className={`${container} scroll-mt-24 pb-[96px] pt-10 lg:pb-[110px]`}>
          <Eyebrow>How it works</Eyebrow>
          <H2 className="max-w-[760px]">From raw data to client-ready report in three steps</H2>
          <p className="mt-4 text-lg text-site-muted">No spreadsheets, no screenshots, no Sunday-night copy-pasting.</p>
          <ol className="mt-14 grid gap-10 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            {[
              {
                title: "Connect a data source",
                text: "Link a client's Search Console, GA4 or Meta Ads in two clicks — read-only, no passwords shared. Data stays synced automatically.",
              },
              {
                title: "Anavyst does the work",
                text: "We pull the metrics, build the charts, and write the executive summary, wins, risks and next steps in plain English — from the real numbers.",
              },
              {
                title: "It sends itself",
                text: "Share a live link, download the PDF, or put it on a schedule — weekly, monthly or quarterly, under your logo, from your domain.",
              },
            ].map((s, i) => (
              <li key={s.title} className="border-t-2 border-site-fg pt-5">
                <p className="font-site-mono text-[13px] text-site-accent">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mb-2.5 mt-3 text-[23px] font-bold tracking-[-0.02em]">{s.title}</h3>
                <p className="text-base leading-[1.55] text-site-muted">{s.text}</p>
              </li>
            ))}
          </ol>
          <Link href="/signup" className={`${textLink} mt-11`}>Connect your first client free →</Link>
        </section>

        {/* ── 4. Benefits ── */}
        <section id="features" className="scroll-mt-24 bg-site-band">
          <div className={`${container} ${sectionY}`}>
            <Eyebrow>Why agencies switch</Eyebrow>
            <H2 className="max-w-[720px]">Built to kill the parts of reporting you hate</H2>
            <p className="mt-4 max-w-[620px] text-lg text-site-muted">
              Every feature exists to win back billable hours — not to add another dashboard to babysit.
            </p>
            <div className="mt-[52px] grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
              {[
                { title: "Reclaim two days a month", text: "Stop rebuilding the same report every month. The data refreshes itself and the narrative writes itself — you just hit send (or don't even do that)." },
                { title: "Grow without a pricing penalty", text: `Per-client fees punish you for winning business. Anavyst keeps it simple: ${scaleLine(pricing)}, while per-client tools charge ~$240/mo for just 20 — with every feature included.` },
                { title: "Insights clients actually read", text: "Charts show what happened; your clients pay you to know why and what's next. Every report explains wins, risks and priorities in plain English." },
                { title: "Look like you built it", text: "Your logo, colours, footer and sending domain on every report and email. Clients see a polished platform from your agency — we stay invisible." },
                { title: "Reports on autopilot", text: "Schedule weekly, monthly or quarterly delivery per client. Anavyst generates, writes and emails it — with a branded PDF attached." },
                { title: "Client data handled right", text: "Read-only access, AES-256-encrypted connections, isolated workspaces. Disconnect and delete any source's data in one click." },
              ].map((b, i) => (
                <div key={b.title} className="rounded-2xl bg-site-page p-7">
                  <p className="font-site-mono text-xs text-site-accent">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mb-2 mt-2.5 text-xl font-bold">{b.title}</h3>
                  <p className="text-[15.5px] leading-[1.55] text-site-muted">{b.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 5. Product tour: AI insights ── */}
        <section className={`${container} ${sectionY} ${split}`}>
          <div>
            <Eyebrow>AI insights</Eyebrow>
            <H2 size="sm">Your clients want answers, not just charts</H2>
            <p className="mb-6 mt-[18px] text-[17px] leading-[1.6] text-site-muted">
              Every report opens with a plain-English executive summary, the period&apos;s key wins and issues, and
              prioritised recommendations — written automatically from the real data, tying search visibility to
              traffic, engagement and conversions.
            </p>
            <CheckList
              items={[
                "Executive summary written in seconds, grounded in the numbers",
                "Winning & declining keywords surfaced automatically",
                "Growth opportunities: near-page-one keywords worth pushing",
                "A prioritised action plan your client can say yes to",
              ]}
            />
          </div>
          <div className="flex flex-col gap-3 rounded-[20px] bg-site-dark p-6 text-site-dark-fg">
            <p className="font-site-mono text-xs text-site-dark-accent">AI summary</p>
            <p className="text-[17px] leading-[1.55]">
              &ldquo;Organic clicks are up 18% and impressions 12% this month, led by &lsquo;carbon plate running
              shoes&rsquo; at position 2.1. Engaged sessions from organic rose 14% — search growth is converting into real
              visits.&rdquo;
            </p>
            {[
              { t: "Win", c: "bg-site-dark-accent", x: "“Carbon plate shoes” clicks up 142% after the comparison post." },
              { t: "Issue", c: "bg-site-amber", x: "“Cheap running shoes” slipped to page 2 — refresh the buying guide." },
              { t: "Next", c: "bg-site-dark-fg", x: "Build a beginner's page — one spot off page one, 2.4k monthly searches." },
            ].map((r) => (
              <div key={r.t} className="flex items-start gap-3 rounded-xl bg-site-dark-card p-3.5">
                <span className={`shrink-0 rounded-md px-2 py-[3px] font-site-mono text-[11px] text-site-dark ${r.c}`}>{r.t}</span>
                <span className="text-sm leading-normal">{r.x}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 6. Product tour: autopilot ── */}
        <section className={`${container} pb-[96px] lg:pb-[110px] ${split}`}>
          <div className="order-2 rounded-[20px] border border-site-line bg-site-card p-6 lg:order-1">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold">Acme Co — delivery schedule</p>
              <span className="rounded-full bg-site-accent-soft px-2.5 py-1 font-site-mono text-xs text-site-accent">Active</span>
            </div>
            <div className="mt-[18px] grid grid-cols-2 gap-3">
              <div className="rounded-[10px] bg-site-tile p-3">
                <p className="font-site-mono text-[11px] uppercase text-site-muted">Frequency</p>
                <p className="mt-1 font-semibold">Monthly · 1st · 8:00</p>
              </div>
              <div className="rounded-[10px] bg-site-tile p-3">
                <p className="font-site-mono text-[11px] uppercase text-site-muted">Recipients</p>
                <p className="mt-1 font-semibold">sarah@acme.co</p>
              </div>
            </div>
            <ul className="mt-3.5">
              {["Jun 1", "May 1", "Apr 1"].map((d) => (
                <li key={d} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-site-line py-3 text-sm">
                  <span className="font-medium">Performance report · {d}</span>
                  <span className="font-site-mono text-xs text-site-accent">Sent · PDF attached</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="order-1 lg:order-2">
            <Eyebrow>Autopilot</Eyebrow>
            <H2 size="sm">Set the schedule once. Never chase a report again.</H2>
            <p className="mb-6 mt-[18px] text-[17px] leading-[1.6] text-site-muted">
              Pick a cadence per client — weekly, monthly or quarterly, down to the day and hour. Anavyst generates
              the report, writes the insights, and emails it from your domain with a branded PDF attached. Delivery
              history shows exactly what went out, and when.
            </p>
            <CheckList
              items={[
                "Weekly, monthly or quarterly — per client",
                "Branded email + PDF attachment, sent from your domain",
                "Send a test to yourself before it ever reaches a client",
                "Full delivery history with sent / failed status",
              ]}
            />
          </div>
        </section>

        {/* ── 7. Product tour: white-label ── */}
        <section className={`${container} pb-[96px] lg:pb-[110px] ${split}`}>
          <div>
            <Eyebrow>White-label</Eyebrow>
            <H2 size="sm">It&apos;s your brand on every report — not ours</H2>
            <p className="mb-6 mt-[18px] text-[17px] leading-[1.6] text-site-muted">
              Upload your logo, set your brand colour, add your footer and verify your own sending domain. Clients see a
              polished report from your agency — your brand on the report, the PDF, and the email sender, not ours.
            </p>
            <CheckList
              items={[
                "Your logo, colours & footer on reports, emails and PDFs",
                "Send from your verified domain",
                "Shareable live link + downloadable PDF export",
              ]}
            />
            <Link href="/sample-report" className={`${textLink} mt-7`}>See the full sample report →</Link>
          </div>
          <div className="rounded-[20px] bg-site-demo p-7 text-site-demo-fg">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-site-demo-fg text-lg font-extrabold text-site-demo">N</span>
              <div>
                <p className="font-bold">Northbeam Digital</p>
                <p className="text-[13px] text-site-demo-muted">Performance Report</p>
              </div>
            </div>
            <div className="mt-[22px] grid grid-cols-3 gap-2.5">
              {[
                { k: "Clicks", w: "w-[70%]" },
                { k: "Sessions", w: "w-[85%]" },
                { k: "Conversions", w: "w-[55%]" },
              ].map((m) => (
                <div key={m.k} className="rounded-[10px] bg-site-demo-fg/10 p-3.5 text-[13px]">
                  {m.k}
                  <div className={`mt-3 h-1.5 rounded-[3px] bg-site-demo-fg ${m.w}`} />
                </div>
              ))}
            </div>
            <div className="mt-4 flex h-[110px] items-end gap-1.5" aria-hidden>
              {[40, 52, 48, 63, 70, 82, 94].map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-[3px] ${i >= 5 ? "bg-site-demo-fg" : "bg-site-demo-fg/30"}`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <p className="mt-[18px] border-t border-site-demo-fg/20 pt-3.5 text-xs text-site-demo-muted">
              Prepared by Northbeam Digital · northbeamdigital.example
            </p>
          </div>
        </section>

        {/* ── 8. Integrations ── */}
        <section id="integrations" className="scroll-mt-24 bg-site-dark text-site-dark-fg">
          <div className={`${container} ${sectionY}`}>
            <Eyebrow onDark>Integrations</Eyebrow>
            <H2 className="max-w-[720px]">Connect the platforms your clients live on</H2>
            <p className="mt-4 text-lg text-site-dark-muted">
              Every plan includes every integration as it ships — no feature gates, no upgrade prompts.
            </p>
            <ul className="mt-12 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
              {MARKETING_INTEGRATIONS.map((it) => {
                const Icon = it.icon;
                // Live/soon comes from the registry (credentials + LIVE_INTEGRATIONS),
                // never a hand-maintained flag — so this page can't tell prospects an
                // integration is "coming soon" while the app is already offering it.
                const live = isLive(it.id);
                return (
                  <li key={it.id} className="flex flex-col gap-3.5 rounded-[14px] bg-site-dark-card p-5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-site-dark-line" aria-hidden>
                      <Icon size={17} />
                    </span>
                    <p className="font-semibold">{it.n}</p>
                    <p className={`font-site-mono text-[11px] ${live ? "text-site-dark-accent" : "text-site-dark-muted"}`}>
                      <span aria-hidden>● </span>{live ? "Live" : "Coming soon"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Testimonials: removed until real, attributable customer quotes exist.
            The launch placeholders were invented ("Illustrative quotes"), which
            is not something to put in front of paid traffic (audit 2026-09-28). */}

        {/* ── 9. Trust / security ── */}
        <section aria-label="Security and data practices" className={`${container} ${sectionY}`}>
          <Eyebrow>Trust &amp; security</Eyebrow>
          <H2 className="max-w-[720px]">Your clients&apos; data, handled like it&apos;s ours</H2>
          <p className="mt-4 max-w-[640px] text-lg leading-[1.55] text-site-muted">
            Your clients&apos; data is used only to generate your reports — never sold, never used for advertising, never
            used to train AI models.
          </p>
          <div className="mt-[52px] grid gap-10 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            {[
              { t: "Read-only access", x: "Anavyst can never change anything in your Google or Meta accounts." },
              { t: "Encrypted connections", x: "OAuth tokens encrypted at rest with AES-256; all traffic over TLS." },
              { t: "Delete anytime", x: "Disconnect any source and its stored data is deleted instantly." },
            ].map((s) => (
              <div key={s.t} className="border-t-2 border-site-fg pt-5">
                <h3 className="mb-2 text-xl font-bold">{s.t}</h3>
                <p className="leading-[1.55] text-site-muted">{s.x}</p>
              </div>
            ))}
          </div>
          <p className="mt-9 text-[15px] text-site-muted">
            Read the details:{" "}
            <Link href="/security" className="font-semibold text-site-fg underline hover:text-site-accent">Data &amp; Security</Link> ·{" "}
            <Link href="/privacy" className="font-semibold text-site-fg underline hover:text-site-accent">Privacy Policy</Link>
          </p>
        </section>

        {/* ── 10. Pricing teaser ── */}
        <section id="pricing" className="scroll-mt-24 bg-site-band">
          <div className={`${container} ${sectionY}`}>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <Eyebrow>Pricing</Eyebrow>
                <H2>Every plan includes every feature.</H2>
                <p className="mt-4 max-w-[600px] text-[17px] leading-[1.55] text-site-muted">
                  Upgrade only when you need more active clients.{savingPct ? ` Save up to ${savingPct}% by paying every 3 months.` : ""} New
                  accounts start with a {PAID_TRIAL_DAYS}-day free trial.
                </p>
              </div>
              <Link href="/pricing" className={textLink}>See full pricing →</Link>
            </div>
            <ul className="mt-11 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr))]">
              {[
                { id: "free", name: "Free", price: "$0", clients: FREE_LIMITS.maxClients },
                ...pricing.map((p) => ({ id: p.id, name: p.name, price: p.monthly?.formatted ?? "—", clients: p.maxClients })),
              ].map((p) => (
                <li key={p.id}>
                  <Link href="/pricing" className="block h-full rounded-[14px] bg-site-page p-5 transition-colors hover:bg-site-card">
                    <p className="font-bold">{p.name}</p>
                    <p className="mt-2.5 text-3xl font-extrabold tracking-[-0.04em]">
                      {p.price}
                      <span className="text-sm font-medium tracking-normal text-site-muted"> /month</span>
                    </p>
                    <p className="mt-1.5 text-[13px] text-site-muted">
                      Up to {p.clients} active client{p.clients === 1 ? "" : "s"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm leading-[1.55] text-site-muted">
              AgencyAnalytics at 20 clients ≈ $240/mo. Whatagraph from ~$249/mo.
              {at20 && (
                <>
                  {" "}Anavyst at 20 clients: <strong className="text-site-fg">{at20.monthly.formatted}/mo</strong> — every
                  feature included.
                </>
              )}
            </p>
          </div>
        </section>

        {/* ── 11. FAQ ── */}
        <section id="faq" className={`mx-auto w-full max-w-[860px] scroll-mt-24 px-6 ${sectionY}`}>
          <Eyebrow>FAQ</Eyebrow>
          <H2 className="mb-9">Questions, answered</H2>
          {/* One open at a time: details sharing a `name` form an exclusive
              accordion, natively, with no client script. */}
          {faqs(pricing, savingPct).map((f, i) => (
            <details key={f.q} name="faq" open={i === 0} className="group border-t border-site-line-strong py-[22px]">
              <summary className="flex cursor-pointer list-none justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <span>{f.q}</span>
                <span className="font-site-mono text-xl leading-none text-site-accent" aria-hidden>
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <p className="mt-3 max-w-[720px] text-base leading-[1.65] text-site-muted">{f.a}</p>
            </details>
          ))}
          <p className="border-t border-site-line-strong pt-6 text-site-muted">
            Something else?{" "}
            <Link href="/contact" className="font-semibold text-site-fg underline hover:text-site-accent">Talk to us</Link> — we read
            everything.
          </p>
        </section>

        {/* ── 12. Final CTA ── */}
        <CtaPanel
          title="Your next client report could send itself"
          body={
            <>
              Free for {PAID_TRIAL_DAYS} days. Connect a client, and have a fully branded, AI-written report in your hands
              before your coffee goes cold.
            </>
          }
          cta={{ href: "/signup", label: "Start free" }}
          footnote={<>Every feature on every plan · {PAID_TRIAL_DAYS}-day free trial · Cancel anytime</>}
        />
      </main>

      <SiteFooter />
    </div>
  );
}

// Two columns from 840px up, stacked below.
const split = "grid items-center gap-14 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]";

// Hero product mock — a stylised report so the value is visible above the fold.
function HeroMock() {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="overflow-hidden rounded-[18px] border border-site-line bg-site-card shadow-[0_30px_60px_-30px_rgb(var(--site-fg)/0.25)]">
        <div className="flex items-center gap-2 border-b border-site-line bg-site-tile px-3.5 py-2.5 font-site-mono text-xs text-site-muted" aria-hidden>
          <span className="h-[9px] w-[9px] rounded-full bg-site-line-strong" />
          <span className="h-[9px] w-[9px] rounded-full bg-site-line-strong" />
          <span className="ml-2 truncate">reports.youragency.com/acme-co</span>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-site-cta font-bold text-site-cta-fg">A</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">Acme Co — Performance Report</p>
              <p className="text-[13px] text-site-muted">Prepared by Your Agency · Last 28 days</p>
            </div>
            <span className="flex items-center gap-1.5 font-site-mono text-xs text-site-accent">
              <span className="h-[7px] w-[7px] rounded-full bg-site-accent" />
              Live
            </span>
          </div>
          <div className="mt-[18px] grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
            {[
              { l: "Clicks", v: "14,820", d: "+18%" },
              { l: "Sessions", v: "21,502", d: "+14%" },
              { l: "Conversions", v: "486", d: "+22%" },
              { l: "Avg Position", v: "9.8", d: "+13%" },
            ].map((m) => (
              <div key={m.l} className="rounded-[10px] bg-site-tile p-3">
                <p className="text-xs text-site-muted">{m.l}</p>
                <p className="mt-1 text-[22px] font-bold tracking-[-0.03em]">{m.v}</p>
                <p className="mt-0.5 text-[11px] text-site-accent">▲ {m.d} vs prev.</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-site-dark p-4 text-site-dark-fg">
            <p className="mb-1.5 font-site-mono text-[11px] text-site-dark-accent">AI summary</p>
            <p className="text-sm leading-[1.55]">
              Organic clicks up 18% this month, led by premium product terms — and that growth is converting: conversions
              rose 22%. Average position improved ~1.5 spots; momentum is building.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <div className="rounded-[14px] bg-site-accent-soft px-4 py-3.5">
          <p className="font-site-mono text-[11px] text-site-accent">AI insight</p>
          <p className="mt-1 text-sm leading-[1.45]">
            &ldquo;Carbon plate shoes&rdquo; is one spot off page one — a beginner&apos;s guide should tip it over.
          </p>
        </div>
        <div className="rounded-[14px] border border-site-line bg-site-card px-4 py-3.5">
          <p className="font-site-mono text-[11px] text-site-muted">Report delivered</p>
          <p className="mt-1 text-sm leading-[1.45]">
            Monthly report emailed to Acme Co with branded PDF attached — automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

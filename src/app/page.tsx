import type { Metadata } from "next";
import Link from "next/link";
import {
  Check, X, Sparkles, Palette, Zap, Clock, Users, FileBarChart2, Plug,
  ArrowRight, ShieldCheck, Search, BarChart3, Facebook, Linkedin, Music,
  Megaphone, MapPin, Twitter, Youtube, CalendarClock, Send, Lock, EyeOff,
  Star, MailCheck, LineChart,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "ReportFlow — White-label client reports on autopilot, written by AI",
  description:
    "The client-reporting tool for marketing agencies. Connect Search Console, GA4 and Meta Ads, and send beautiful white-label reports with AI-written insights — flat price, unlimited clients, live in 5 minutes.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "ReportFlow — White-label client reports on autopilot",
    description:
      "Connect a client's marketing data and send agency-grade, AI-written reports under your brand. Flat price, unlimited clients.",
  },
};

const navLinks = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "Integrations", href: "#integrations" },
  { label: "Compare", href: "#compare" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const FAQS = [
  {
    q: "How is ReportFlow different from AgencyAnalytics or Whatagraph?",
    a: "Three things. Flat pricing — unlimited clients, no per-client fees. AI-written insights on every report, not just charts. And setup measured in minutes: connect a source, pick an account, generate. We deliberately skip the 100-widget dashboard maze and do the reporting part exceptionally well.",
  },
  {
    q: "Do you really not charge per client?",
    a: "Correct. One flat price covers unlimited clients, unlimited reports, and every feature. Your 50th client costs the same as your 5th: nothing extra.",
  },
  {
    q: "Which data sources are live today?",
    a: "Google Search Console, Google Analytics 4, and Meta Ads (Facebook & Instagram) are live now. Google Ads, Google Business Profile, LinkedIn Ads, Microsoft Ads, TikTok Ads, X and YouTube are on the roadmap — and one flat price includes every integration as it ships.",
  },
  {
    q: "Is it actually white-label?",
    a: "Yes. Your logo, brand colour and footer appear on every report and email, and reports send from your own verified domain. Your clients never see the ReportFlow name.",
  },
  {
    q: "Can reports go out automatically?",
    a: "Yes — set a weekly, monthly, or quarterly schedule per client and ReportFlow generates the report, writes the insights, and emails it with a branded PDF attached. You can also send test runs to yourself first.",
  },
  {
    q: "Is my clients' data safe?",
    a: "Access is read-only — ReportFlow can never change anything in your Google or Meta accounts. Connection tokens are encrypted with AES-256, every workspace is isolated at the database level, and your data is only ever used to generate your reports — never sold or used for advertising. You can disconnect any source and delete its data instantly.",
  },
  {
    q: "How long does setup take?",
    a: "About five minutes: create an account, connect a client's Search Console or GA4, pick a property, and generate your first AI-written report. No onboarding calls, no dashboard building.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. The trial needs no card, and paid plans can be cancelled in one click — you keep access until the end of the period you've paid for.",
  },
];

// Structured data: product + FAQ rich results.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "ReportFlow",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "White-label client reporting for marketing agencies with AI-written insights. Flat price, unlimited clients.",
      offers: { "@type": "Offer", price: "49", priceCurrency: "USD" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-ink-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Brand className="text-lg" />
          <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-ink-600 md:flex">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-ink-900">{l.label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="hidden text-ink-700 hover:text-ink-900 sm:inline">Sign in</Link>
            <Link href="/signup" className="rounded-lg bg-brand-500 px-4 py-2 font-medium text-white transition hover:bg-brand-600">
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* ── 1. Hero ── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-gradient-to-b from-brand-50 via-brand-50/40 to-white" />
        <div
          className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #c7d2fe, transparent)" }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-medium text-brand-700 shadow-xs">
            <Sparkles size={13} aria-hidden /> The reporting tool for agencies that hate reporting
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Client reports that used to take all day,
            <span className="text-brand-600"> sent in minutes.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-500">
            Connect a client&apos;s <span className="font-medium text-ink-700">Search Console, GA4 or Meta Ads</span> once.
            ReportFlow pulls the data, writes the insights with AI, and delivers a beautiful report under{" "}
            <span className="font-medium text-ink-700">your brand</span> — on schedule, every time.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-7 py-3.5 font-medium text-white shadow-md shadow-brand-500/25 transition hover:bg-brand-600"
            >
              Start free — no card required <ArrowRight size={18} aria-hidden />
            </Link>
            <Link
              href="/sample-report"
              className="rounded-lg border border-slate-200 bg-white/70 px-7 py-3.5 font-medium text-ink-700 transition hover:bg-slate-50"
            >
              View a sample report
            </Link>
          </div>
          <p className="mt-4 text-xs text-ink-400">
            14-day free trial · Flat price, unlimited clients · Live in 5 minutes · Cancel anytime
          </p>

          {/* Hero product mock: report in a browser frame + floating proof chips */}
          <div className="relative mx-auto mt-14 max-w-4xl">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-brand-500/10">
              <BrowserBar url="reports.youragency.com/acme-co" />
              <ReportMock />
            </div>

            <div className="absolute -left-6 top-24 hidden w-52 rotate-[-2deg] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg lg:block">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-600">
                <Sparkles size={12} aria-hidden /> AI insight
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
                &ldquo;Carbon plate shoes&rdquo; is one spot off page one — a beginner&apos;s guide should tip it over.
              </p>
            </div>
            <div className="absolute -right-6 bottom-20 hidden w-56 rotate-[2deg] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg lg:block">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <MailCheck size={13} aria-hidden /> Report delivered
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
                Monthly report emailed to Acme Co with branded PDF attached — automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Stat strip ── */}
      <section aria-label="Highlights" className="border-y border-slate-100 bg-slate-50/60">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-5 py-8 text-center sm:grid-cols-4">
          {[
            { v: "5 min", l: "from signup to first report" },
            { v: "∞", l: "clients on one flat price" },
            { v: "3 live", l: "integrations, 7 more coming" },
            { v: "100%", l: "your brand, not ours" },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-2xl font-semibold text-brand-600">{s.v}</p>
              <p className="mt-0.5 text-xs text-ink-500">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. How it works ── */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
        <SectionHeading
          eyebrow="How it works"
          title="From raw data to client-ready report in three steps"
          subtitle="No spreadsheets, no screenshots, no Sunday-night copy-pasting."
        />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Plug,
              title: "1. Connect a data source",
              text: "Link a client's Search Console, GA4 or Meta Ads in two clicks — read-only, no passwords shared. Data stays synced automatically.",
            },
            {
              icon: Sparkles,
              title: "2. ReportFlow does the work",
              text: "We pull the metrics, build the charts, and write the executive summary, wins, risks and next steps in plain English — from the real numbers.",
            },
            {
              icon: Send,
              title: "3. It sends itself",
              text: "Share a live link, download the PDF, or put it on a schedule — weekly, monthly or quarterly, under your logo, from your domain.",
            },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="group relative rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon size={20} aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold text-ink-900">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{s.text}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-10 text-center">
          <Link href="/signup" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
            Connect your first client free <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </section>

      {/* ── 4. Benefits ── */}
      <section id="features" className="scroll-mt-20 bg-slate-50/60 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHeading
            eyebrow="Why agencies switch"
            title="Built to kill the parts of reporting you hate"
            subtitle="Every feature exists to win back billable hours — not to add another dashboard to babysit."
          />
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Clock, title: "Reclaim two days a month", text: "Stop rebuilding the same report every month. The data refreshes itself and the narrative writes itself — you just hit send (or don't even do that)." },
              { icon: Users, title: "Grow without a pricing penalty", text: "Per-client fees punish you for winning business. ReportFlow is flat: your 50th client costs the same as your 5th." },
              { icon: Sparkles, title: "Insights clients actually read", text: "Charts show what happened; your clients pay you to know why and what's next. Every report explains wins, risks and priorities in plain English." },
              { icon: Palette, title: "Look like you built it", text: "Your logo, colours, footer and sending domain on every report and email. Clients see a polished platform from your agency — we stay invisible." },
              { icon: CalendarClock, title: "Reports on autopilot", text: "Schedule weekly, monthly or quarterly delivery per client. ReportFlow generates, writes and emails it — with a branded PDF attached." },
              { icon: ShieldCheck, title: "Client data handled right", text: "Read-only access, AES-256-encrypted connections, isolated workspaces. Disconnect and delete any source's data in one click." },
            ].map((b) => {
              const Icon = b.icon;
              return (
                <div key={b.title} className="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon size={18} aria-hidden />
                  </div>
                  <h3 className="mt-4 font-semibold text-ink-900">{b.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{b.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 5. Product tour: AI insights ── */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 lg:grid-cols-2">
        <div>
          <Eyebrow icon={Sparkles}>AI insights</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Your clients want answers, not just charts</h2>
          <p className="mt-4 leading-relaxed text-ink-500">
            Every report opens with a plain-English executive summary, the period&apos;s key wins and issues, and
            prioritised recommendations — written automatically from the real data, tying search visibility to
            traffic, engagement and conversions.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              "Executive summary written in seconds, grounded in the numbers",
              "Winning & declining keywords surfaced automatically",
              "Growth opportunities: near-page-one keywords worth pushing",
              "A prioritised action plan your client can say yes to",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm text-ink-700">
                <Check size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-600">
            <Sparkles size={15} aria-hidden /> AI summary
          </div>
          <p className="text-sm leading-relaxed text-ink-700">
            &ldquo;Organic clicks are up <span className="font-semibold text-emerald-600">18%</span> and impressions{" "}
            <span className="font-semibold text-emerald-600">12%</span> this month, led by &lsquo;carbon plate running
            shoes&rsquo; at position 2.1. Engaged sessions from organic rose 14% — search growth is converting into real
            visits.&rdquo;
          </p>
          <div className="mt-4 space-y-2">
            {[
              { t: "Win", c: "bg-emerald-50 text-emerald-700", x: "“Carbon plate shoes” clicks up 142% after the comparison post." },
              { t: "Issue", c: "bg-rose-50 text-rose-600", x: "“Cheap running shoes” slipped to page 2 — refresh the buying guide." },
              { t: "Next", c: "bg-amber-50 text-amber-700", x: "Build a beginner's page — one spot off page one, 2.4k monthly searches." },
            ].map((r) => (
              <div key={r.t} className="flex items-start gap-2 text-xs">
                <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${r.c}`}>{r.t}</span>
                <span className="leading-relaxed text-ink-600">{r.x}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. Product tour: autopilot ── */}
      <section className="bg-slate-50/60 py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink-900">Acme Co — delivery schedule</p>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">Active</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-left">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Frequency</p>
                  <p className="mt-0.5 text-sm font-medium text-ink-800">Monthly · 1st · 8:00</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Recipients</p>
                  <p className="mt-0.5 text-sm font-medium text-ink-800">sarah@acme.co</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {[
                  { d: "Jun 1", s: "Sent", c: "text-emerald-600 bg-emerald-50" },
                  { d: "May 1", s: "Sent", c: "text-emerald-600 bg-emerald-50" },
                  { d: "Apr 1", s: "Sent", c: "text-emerald-600 bg-emerald-50" },
                ].map((r) => (
                  <div key={r.d} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2 text-ink-600">
                      <FileBarChart2 size={13} className="text-ink-400" aria-hidden /> Performance report · {r.d}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${r.c}`}>{r.s} · PDF attached</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <Eyebrow icon={CalendarClock}>Autopilot</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">Set the schedule once. Never chase a report again.</h2>
            <p className="mt-4 leading-relaxed text-ink-500">
              Pick a cadence per client — weekly, monthly or quarterly, down to the day and hour. ReportFlow generates
              the report, writes the insights, and emails it from your domain with a branded PDF attached. Delivery
              history shows exactly what went out, and when.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Weekly, monthly or quarterly — per client",
                "Branded email + PDF attachment, sent from your domain",
                "Send a test to yourself before it ever reaches a client",
                "Full delivery history with sent / failed status",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-ink-700">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 7. Product tour: white-label ── */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 px-6 py-6 text-white" style={{ background: "linear-gradient(135deg,#4f46e5,#3730a3)" }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/95 text-sm font-bold text-brand-600">N</div>
              <span className="font-semibold">Northbeam Digital</span>
              <span className="ml-auto rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">Performance Report</span>
            </div>
            <div className="space-y-3 bg-white p-6">
              <div className="grid grid-cols-3 gap-2">
                {["Clicks", "Sessions", "Conversions"].map((k) => (
                  <div key={k} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[10px] text-ink-500">{k}</p>
                    <div className="mt-1 h-4 w-12 rounded bg-brand-100" />
                  </div>
                ))}
              </div>
              <div className="flex items-end gap-1.5" aria-hidden>
                {[40, 55, 48, 70, 62, 85, 78].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-brand-500/80" style={{ height: h }} />
                ))}
              </div>
              <p className="pt-1 text-center text-[10px] text-ink-400">
                Prepared by Northbeam Digital · northbeamdigital.example
              </p>
            </div>
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <Eyebrow icon={Palette}>White-label</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">It&apos;s your brand on every report — not ours</h2>
          <p className="mt-4 leading-relaxed text-ink-500">
            Upload your logo, set your brand colour, add your footer and send from your own domain. Clients see a
            polished reporting platform from <span className="font-medium text-ink-700">your agency</span>. ReportFlow
            never appears — not on the report, not in the email, not in the PDF.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              "Your logo, colours & footer on reports, emails and PDFs",
              "Send from your verified domain",
              "Shareable live link + downloadable PDF export",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm text-ink-700">
                <Check size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <Link href="/sample-report" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
            See the full sample report <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </section>

      {/* ── 8. Integrations ── */}
      <section id="integrations" className="scroll-mt-20 bg-slate-50/60 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHeading
            eyebrow="Integrations"
            title="Connect the platforms your clients live on"
            subtitle="Search Console, GA4 and Meta Ads are live today. One flat price includes every integration as it ships."
          />
          <div className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { n: "Search Console", live: true, icon: Search },
              { n: "Google Analytics 4", live: true, icon: BarChart3 },
              { n: "Meta Ads", live: true, icon: Facebook },
              { n: "Google Ads", live: false, icon: Megaphone },
              { n: "Business Profile", live: false, icon: MapPin },
              { n: "LinkedIn Ads", live: false, icon: Linkedin },
              { n: "Microsoft Ads", live: false, icon: LineChart },
              { n: "TikTok Ads", live: false, icon: Music },
              { n: "X (Twitter)", live: false, icon: Twitter },
              { n: "YouTube", live: false, icon: Youtube },
            ].map((it) => {
              const Icon = it.icon;
              return (
                <div key={it.n} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon size={18} aria-hidden />
                  </div>
                  <p className="mt-3 text-sm font-medium text-ink-800">{it.n}</p>
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      it.live ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-ink-400"
                    }`}
                  >
                    {it.live ? "Live" : "Coming soon"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 9. Comparison ── */}
      <section id="compare" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-24">
        <SectionHeading
          eyebrow="How we compare"
          title="Agency-grade reports, without the price tag or the bloat"
          subtitle="Why lean agencies move from AgencyAnalytics and Whatagraph."
        />
        <div className="mt-14 overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Feature comparison between ReportFlow, AgencyAnalytics, and Whatagraph</caption>
            <thead>
              <tr>
                <th scope="col" className="w-[34%] p-4 text-left font-medium text-ink-500"></th>
                <th scope="col" className="rounded-t-xl bg-brand-500 p-4 text-center font-semibold text-white">ReportFlow</th>
                <th scope="col" className="p-4 text-center font-medium text-ink-600">AgencyAnalytics</th>
                <th scope="col" className="p-4 text-center font-medium text-ink-600">Whatagraph</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="border-b border-slate-100 p-4 text-left font-medium text-ink-700">Pricing model</th>
                <td className="border-x border-brand-100 bg-brand-50/40 p-4 text-center font-semibold text-brand-700">$49 flat, unlimited clients</td>
                <td className="border-b border-slate-100 p-4 text-center text-ink-500">Per client, per month</td>
                <td className="border-b border-slate-100 p-4 text-center text-ink-500">From ~$249/mo</td>
              </tr>
              {[
                { f: "AI-written insights & recommendations", a: true, b: false, c: false },
                { f: "Setup in minutes, not days", a: true, b: false, c: false },
                { f: "Fully white-label reports", a: true, b: true, c: true },
                { f: "Scheduled email delivery with PDF", a: true, b: true, c: true },
                { f: "No per-client fees", a: true, b: false, c: false },
                { f: "No dashboard maze to configure", a: true, b: false, c: false },
              ].map((r, i, arr) => (
                <tr key={r.f}>
                  <th scope="row" className="border-b border-slate-100 p-4 text-left font-medium text-ink-700">{r.f}</th>
                  <td className={`border-x border-brand-100 bg-brand-50/40 p-4 text-center ${i === arr.length - 1 ? "rounded-b-xl border-b" : ""}`}>
                    <Cell on={r.a} />
                  </td>
                  <td className="border-b border-slate-100 p-4 text-center"><Cell on={r.b} /></td>
                  <td className="border-b border-slate-100 p-4 text-center"><Cell on={r.c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-center text-xs text-ink-400">
          Comparison reflects typical positioning and public pricing at time of writing; competitor plans change over time.
        </p>
        <div className="mt-8 text-center">
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-3 font-medium text-white transition hover:bg-brand-600">
            Try the difference free <ArrowRight size={17} aria-hidden />
          </Link>
        </div>
      </section>

      {/* ── 10. Testimonials ── */}
      <section className="bg-slate-50/60 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHeading eyebrow="Built for lean agencies" title="More billable hours, fewer reporting weekends" />
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              { q: "We cut monthly reporting from two full days to about twenty minutes. The AI summaries alone are worth it.", n: "Founder", a: "3-person SEO studio" },
              { q: "Switching off per-client pricing saved us hundreds a month. Adding a client now costs us nothing.", n: "Owner", a: "PPC agency" },
              { q: "Clients think we built a custom reporting platform. It's just ReportFlow under our brand.", n: "Director", a: "Growth agency" },
            ].map((t) => (
              <figure key={t.q} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex gap-0.5 text-amber-400" aria-hidden>
                  {Array.from({ length: 5 }).map((_, j) => <Star key={j} size={14} fill="currentColor" />)}
                </div>
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-ink-700">&ldquo;{t.q}&rdquo;</blockquote>
                <figcaption className="mt-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700" aria-hidden>
                    {t.n.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-800">{t.n}</p>
                    <p className="text-xs text-ink-400">{t.a}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-ink-400">Illustrative quotes shown during launch.</p>
        </div>
      </section>

      {/* ── 11. Trust / security band ── */}
      <section aria-label="Security and data practices" className="mx-auto max-w-6xl px-5 py-24">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-12">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow icon={ShieldCheck}>Trust &amp; security</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">Your clients&apos; data, handled like it&apos;s ours</h2>
            <p className="mt-3 text-ink-500">
              Your data is used only to generate your reports — never sold, never used for advertising, never used to
              train AI models.
            </p>
          </div>
          <div className="mt-10 grid gap-6 text-center sm:grid-cols-3">
            {[
              { icon: EyeOff, t: "Read-only access", x: "ReportFlow can never change anything in your Google or Meta accounts." },
              { icon: Lock, t: "Encrypted connections", x: "OAuth tokens encrypted at rest with AES-256; all traffic over TLS." },
              { icon: Zap, t: "Delete anytime", x: "Disconnect any source and its stored data is deleted instantly." },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.t}>
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon size={20} aria-hidden />
                  </div>
                  <h3 className="mt-3 font-semibold text-ink-900">{s.t}</h3>
                  <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-ink-500">{s.x}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-8 text-center text-xs text-ink-400">
            Read the details: <Link href="/security" className="font-medium text-brand-600 hover:underline">Data &amp; Security</Link> ·{" "}
            <Link href="/privacy" className="font-medium text-brand-600 hover:underline">Privacy Policy</Link>
          </p>
        </div>
      </section>

      {/* ── 12. Pricing ── */}
      <section id="pricing" className="scroll-mt-20 bg-slate-50/60 py-24">
        <div className="mx-auto max-w-5xl px-5">
          <SectionHeading
            eyebrow="Pricing"
            title="One flat price. Unlimited clients. Everything included."
            subtitle="Less than one billable hour a month — for the tool that saves you days of them."
          />
          <div className="mx-auto mt-14 grid max-w-3xl gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-7">
              <p className="text-sm font-medium text-ink-500">Free trial</p>
              <p className="mt-2 text-4xl font-semibold">$0</p>
              <p className="mt-1 text-sm text-ink-400">14 days · no card required</p>
              <Link href="/signup" className="mt-6 block rounded-lg border border-slate-200 px-5 py-3 text-center font-medium text-ink-700 transition hover:bg-slate-50">
                Start free
              </Link>
              <ul className="mt-6 space-y-2.5 text-sm text-ink-600">
                {["Full access to every feature", "Connect real clients & real data", "Generate AI-written reports", "No card, no commitment"].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check size={15} className="shrink-0 text-brand-600" aria-hidden /> {t}</li>
                ))}
              </ul>
            </div>
            <div className="relative rounded-2xl border-2 border-brand-500 bg-white p-7 shadow-lg shadow-brand-500/10">
              <span className="absolute -top-3 left-7 rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white">Most popular</span>
              <p className="text-sm font-medium text-ink-500">Agency</p>
              <p className="mt-2 text-4xl font-semibold">
                $49<span className="text-base font-normal text-ink-400">/mo</span>
              </p>
              <p className="mt-1 text-sm text-ink-400">Flat — or $39/mo billed annually</p>
              <Link href="/signup" className="mt-6 block rounded-lg bg-brand-500 px-5 py-3 text-center font-medium text-white transition hover:bg-brand-600">
                Start 14-day free trial
              </Link>
              <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
                {[
                  "Unlimited clients & reports",
                  "AI insights on every report",
                  "Full white-label branding & sending domain",
                  "Scheduled delivery with PDF attachments",
                  "Every integration, as it launches",
                  "Cancel anytime",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check size={15} className="shrink-0 text-brand-600" aria-hidden /> {t}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-ink-400">
            AgencyAnalytics at 20 clients ≈ $240/mo. Whatagraph from ~$249/mo. ReportFlow: $49. Flat.
          </p>
        </div>
      </section>

      {/* ── 13. FAQ ── */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-24">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-10 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {FAQS.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink-800 marker:hidden">
                {f.q}
                <span className="shrink-0 text-ink-400 transition group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-500">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-ink-500">
          Something else? <Link href="/contact" className="font-medium text-brand-600 hover:underline">Talk to us</Link> — we read everything.
        </p>
      </section>

      {/* ── 14. Final CTA ── */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="overflow-hidden rounded-3xl px-8 py-16 text-center text-white sm:px-16" style={{ background: "linear-gradient(135deg,#4f46e5,#3730a3)" }}>
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Your next client report could send itself
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">
            Free for 14 days, no card required. Connect a client, and have a fully branded, AI-written report in your
            hands before your coffee goes cold.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-lg bg-white px-7 py-3.5 font-medium text-brand-700 transition hover:bg-white/90">
              Start free <ArrowRight size={18} aria-hidden />
            </Link>
            <Link href="/sample-report" className="rounded-lg border border-white/30 px-7 py-3.5 font-medium text-white transition hover:bg-white/10">
              View a sample report
            </Link>
          </div>
          <p className="mt-6 text-xs text-white/60">Flat price · Unlimited clients · Cancel anytime</p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/* ── helpers ── */
function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold text-brand-600">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 leading-relaxed text-ink-500">{subtitle}</p>}
    </div>
  );
}

function Eyebrow({ icon: Icon, children }: { icon: typeof Sparkles; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
      <Icon size={13} aria-hidden /> {children}
    </span>
  );
}

function Cell({ on }: { on: boolean }) {
  return on ? (
    <Check size={18} className="mx-auto text-emerald-600" aria-label="Included" />
  ) : (
    <X size={18} className="mx-auto text-slate-300" aria-label="Not included" />
  );
}

function BrowserBar({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5" aria-hidden>
      <span className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
      </span>
      <span className="mx-auto flex items-center gap-1.5 rounded-md bg-white px-3 py-1 text-[11px] text-ink-400 ring-1 ring-slate-200">
        <Lock size={10} /> {url}
      </span>
    </div>
  );
}

// Inline hero mock — a stylised report so the value is visible above the fold.
function ReportMock() {
  return (
    <div>
      <div className="flex items-center gap-3 px-6 py-5 text-white" style={{ background: "linear-gradient(135deg,#4f46e5,#3730a3)" }}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/95 text-sm font-bold text-brand-600">A</div>
        <div className="text-left">
          <p className="text-sm font-semibold leading-tight">Acme Co — Performance Report</p>
          <p className="text-[11px] text-white/70">Prepared by Your Agency · Last 28 days</p>
        </div>
        <span className="ml-auto rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">Live</span>
      </div>
      <div className="grid grid-cols-2 gap-3 p-5 text-left sm:grid-cols-4">
        {[
          { l: "Clicks", v: "14,820", d: "+18%" },
          { l: "Sessions", v: "21,502", d: "+14%" },
          { l: "Conversions", v: "486", d: "+22%" },
          { l: "Avg Position", v: "9.8", d: "+13%" },
        ].map((m) => (
          <div key={m.l} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[11px] text-ink-500">{m.l}</p>
            <p className="mt-0.5 text-lg font-semibold text-brand-600">{m.v}</p>
            <p className="text-[10px] font-medium text-emerald-600">▲ {m.d} vs prev.</p>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1.5 px-5 pb-3" aria-hidden>
        {[34, 48, 42, 60, 52, 71, 64, 80, 73, 90].map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-brand-500/70" style={{ height: h }} />
        ))}
      </div>
      <div className="mx-5 mb-5 rounded-xl border border-brand-100 bg-brand-50/50 p-3 text-left">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-600">
          <Sparkles size={12} aria-hidden /> AI summary
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
          Organic clicks up 18% this month, led by premium product terms — and that growth is converting: conversions
          rose 22%. Average position improved ~1.5 spots; momentum is building.
        </p>
      </div>
    </div>
  );
}

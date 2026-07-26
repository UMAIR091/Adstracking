// Help Center content (launch audit P1-6). Data-driven so articles are easy to
// edit/add and the index stays searchable. Body paragraphs are plain text;
// blank-line-separated. Keep them short and task-focused.

export type HelpArticle = {
  slug: string;
  category: HelpCategory;
  title: string;
  summary: string;
  body: string; // paragraphs separated by \n\n; lines starting with "- " render as list items
  keywords?: string[];
};

export type HelpCategory =
  | "Getting started"
  | "Integrations"
  | "Reports"
  | "Scheduling"
  | "White-label"
  | "Billing"
  | "FAQ";

export const HELP_CATEGORIES: HelpCategory[] = [
  "Getting started",
  "Integrations",
  "Reports",
  "Scheduling",
  "White-label",
  "Billing",
  "FAQ",
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "getting-started",
    category: "Getting started",
    title: "Getting started with ReportFlow",
    summary: "From signup to your first branded client report in a few minutes.",
    keywords: ["setup", "onboarding", "first report", "quick start"],
    body: `ReportFlow turns your clients' marketing data into beautiful, white-label reports — written by AI and delivered on autopilot.

Here's the fastest path to value:

- Finish onboarding: add your agency name, logo and brand colour so every report is branded as yours.
- Add your first client from Clients → Add client.
- Open the client and connect a data source (Google Search Console, GA4, or Meta Ads).
- Wait a moment for the first sync — the page updates automatically when data is ready.
- Click "Generate report" to create an AI-written, shareable report.

That's it. From there you can schedule reports to send automatically, and send from your own domain.`,
  },
  {
    slug: "connect-integrations",
    category: "Integrations",
    title: "Connecting a data source",
    summary: "How to connect Search Console, GA4, Meta Ads and more to a client.",
    keywords: ["connect", "oauth", "google", "meta", "ga4", "search console", "data source"],
    body: `Integrations are connected per client, so each client's report only ever contains their own data.

To connect one:

- Open a client (Clients → pick a client).
- In "Data sources", click Connect on the integration you want.
- Review the consent screen — it shows exactly what ReportFlow will read (read-only, no passwords shared) — then continue.
- Sign in with the client's account and approve access.
- You'll return to ReportFlow and the source starts syncing automatically.

If an integration shows "Coming soon", it isn't available in your plan/region yet. Data refreshes automatically after the first sync — you never have to pull it manually.`,
  },
  {
    slug: "generate-reports",
    category: "Reports",
    title: "Generating a report",
    summary: "Create an AI-written report from a client's synced data.",
    keywords: ["report", "generate", "ai insights", "pdf", "share"],
    body: `Once a client has at least one connected, synced source, you can generate a report.

- Open the client and click "Generate report".
- Pick a template (e.g. SEO, Marketing, Executive) and a period.
- ReportFlow pulls the metrics, builds the charts, and writes an executive summary, key wins, issues and recommended actions — from the real numbers.

Every report gives you three ways to deliver it:

- A live shareable link (reports.youragency.com/…).
- A downloadable branded PDF.
- Automated email delivery on a schedule.

You can find every report you've made under Reports, with search and filters.`,
  },
  {
    slug: "schedule-reports",
    category: "Scheduling",
    title: "Scheduling automated reports",
    summary: "Send branded reports weekly, monthly or quarterly — hands-off.",
    keywords: ["schedule", "automate", "recurring", "weekly", "monthly", "delivery"],
    body: `Scheduling generates and emails a branded report on a cadence, so you never rebuild the same report again.

- Open a client and find "Automated delivery".
- Choose a frequency (weekly, monthly or quarterly), the day and hour, and the recipients.
- Save. ReportFlow will generate the report and email it automatically, with a branded PDF attached.

Tips:

- Use "Send test" to email yourself a copy first.
- Delivery history shows exactly what was sent and when, with sent/failed status.
- You need your agency logo set before scheduling, so client reports are never sent unbranded.`,
  },
  {
    slug: "white-label-setup",
    category: "White-label",
    title: "White-label & sending domain setup",
    summary: "Put your brand on every report, and send email from your own domain.",
    keywords: ["white label", "branding", "logo", "domain", "sender", "email domain"],
    body: `ReportFlow stays invisible — your brand is on every report, email and PDF.

Branding (Settings):

- Upload your logo, set your brand colour and footer.
- These apply to reports, emails and PDF exports automatically.

Sending from your own domain (Settings → Email branding):

- Add your domain (e.g. agency.com).
- Add the DNS records we show you at your domain registrar.
- Click Verify. Once verified, reports send from reports@yourdomain — not from ReportFlow.

Until a domain is verified, reports send from the default platform sender. You can send a test email to confirm everything looks right.`,
  },
  {
    slug: "billing-and-plans",
    category: "Billing",
    title: "Billing, plans & your free trial",
    summary: "How the trial, plans, upgrades and cancellation work.",
    keywords: ["billing", "trial", "upgrade", "cancel", "plan", "invoice", "paddle", "refund"],
    body: `Every account starts with a free trial — full access, no card required. If you do nothing, the trial simply ends and you're never charged.

Plans:

- Plans are priced by the number of active clients — every feature is included on every plan.
- See Billing to choose a plan or change it later. Upgrades take effect immediately (prorated); downgrades apply from your next renewal.

Payments & invoices:

- Payments are securely processed by Paddle, our merchant of record. Manage your payment method and invoices from Billing → Manage billing.

Cancelling:

- Cancel any time from Billing. You keep full access until the end of your current period, and you won't be charged again.`,
  },
  {
    slug: "faq",
    category: "FAQ",
    title: "Frequently asked questions",
    summary: "Quick answers to the most common questions.",
    keywords: ["faq", "questions", "help", "security", "data"],
    body: `Is my clients' data safe?
Yes. Connections are read-only, tokens are encrypted (AES-256), and each agency's data is isolated. You can disconnect a source and delete its data in one click.

Do I need a credit card to try it?
No. The free trial needs no card, and you're never charged automatically.

Can clients see ReportFlow?
No. Reports, emails and PDFs carry your branding only — ReportFlow never appears.

What happens when I hit my client limit?
Existing clients and reports keep working. To add more active clients, upgrade — or archive a client you no longer report on to free up a slot.

How often does data refresh?
Automatically after the first sync. You don't need to pull data manually.

Still stuck?
Use "Contact support" below and we'll help.`,
  },
];

export function getArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}

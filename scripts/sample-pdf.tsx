// Temporary local script: renders the PDF with realistic sample data so the
// design can be checked without a live report. Run: npx tsx scripts/sample-pdf.tsx
import { writeFileSync } from "node:fs";
import { renderReportPdf } from "../src/lib/pdf";

function days(n: number, base: number, wobble: number, trend = 0): { date: string; v: number }[] {
  const out: { date: string; v: number }[] = [];
  const start = new Date("2026-06-01");
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push({ date: d.toISOString().slice(0, 10), v: Math.max(0, Math.round(base + trend * i + Math.sin(i / 2.5) * wobble + (Math.random() - 0.5) * wobble)) });
  }
  return out;
}

const gscDays = days(30, 320, 60, 4);
const ga4Days = days(30, 540, 90, 6);

const data = {
  gsc: {
    totals: { clicks: 10412, impressions: 402_331, ctr: 0.0259, position: 12.4 },
    previousTotals: { clicks: 8467, impressions: 371_204, ctr: 0.0228, position: 14.1 },
    topQueries: [
      { key: "handmade leather bags", clicks: 1240, impressions: 22100, ctr: 0.056, position: 3.2 },
      { key: "custom leather wallets australia", clicks: 986, impressions: 18400, ctr: 0.054, position: 4.1 },
      { key: "leather laptop sleeve", clicks: 743, impressions: 25900, ctr: 0.029, position: 6.8 },
      { key: "personalised leather gifts", clicks: 512, impressions: 9800, ctr: 0.052, position: 5.0 },
      { key: "mens leather duffle bag", clicks: 431, impressions: 30100, ctr: 0.014, position: 9.4 },
      { key: "leather belt handmade", clicks: 322, impressions: 12500, ctr: 0.026, position: 8.1 },
      { key: "leather crossbody bag women", clicks: 287, impressions: 21000, ctr: 0.014, position: 11.2 },
      { key: "buy leather satchel online", clicks: 240, impressions: 7100, ctr: 0.034, position: 6.3 },
      { key: "vegetable tanned leather goods", clicks: 199, impressions: 5600, ctr: 0.036, position: 7.7 },
      { key: "leather care guide", clicks: 154, impressions: 8900, ctr: 0.017, position: 12.9 },
    ],
    topPages: [],
    topCountries: [],
    topDevices: [],
    byDate: gscDays.map((d, i) => ({ date: d.date, clicks: d.v, impressions: d.v * 38, ctr: 0.026, position: 14 - i * 0.06 })),
    movers: {
      winners: [
        { key: "handmade leather bags", clicks: 1240, prevClicks: 820, changePct: 51.2, position: 3.2 },
        { key: "personalised leather gifts", clicks: 512, prevClicks: 301, changePct: 70.1, position: 5.0 },
        { key: "leather laptop sleeve", clicks: 743, prevClicks: 601, changePct: 23.6, position: 6.8 },
        { key: "buy leather satchel online", clicks: 240, prevClicks: 187, changePct: 28.3, position: 6.3 },
      ],
      decliners: [
        { key: "cheap leather bags", clicks: 82, prevClicks: 240, changePct: -65.8, position: 18.2 },
        { key: "leather bag sale", clicks: 121, prevClicks: 210, changePct: -42.4, position: 14.6 },
        { key: "leather tote bag", clicks: 96, prevClicks: 143, changePct: -32.9, position: 12.8 },
      ],
      opportunities: [
        { key: "mens leather duffle bag", clicks: 431, impressions: 30100, position: 9.4 },
        { key: "leather crossbody bag women", clicks: 287, impressions: 21000, position: 11.2 },
        { key: "leather care guide", clicks: 154, impressions: 8900, position: 12.9 },
        { key: "leather weekender bag", clicks: 88, impressions: 14200, position: 11.8 },
      ],
    },
  },
  ga4: {
    totals: { users: 18240, newUsers: 12110, sessions: 24880, engagedSessions: 15230, engagementRate: 0.612, avgEngagementTime: 74, views: 61200, conversions: 812, totalRevenue: 48230 },
    previousTotals: { users: 15980, newUsers: 10894, sessions: 21010, engagedSessions: 12100, engagementRate: 0.576, avgEngagementTime: 69, views: 52800, conversions: 641, totalRevenue: 36110 },
    byDate: ga4Days.map((d) => ({ date: d.date, users: Math.round(d.v * 0.72), sessions: d.v, views: d.v * 2.4 })),
    topLandingPages: [
      { key: "https://tannerandhide.com/", sessions: 6120, users: 4880 },
      { key: "https://tannerandhide.com/collections/bags", sessions: 4210, users: 3390 },
      { key: "https://tannerandhide.com/collections/wallets", sessions: 2980, users: 2410 },
      { key: "https://tannerandhide.com/products/heritage-duffle", sessions: 1870, users: 1540 },
      { key: "https://tannerandhide.com/blog/leather-care-guide", sessions: 1420, users: 1260 },
      { key: "https://tannerandhide.com/pages/about", sessions: 980, users: 861 },
      { key: "https://tannerandhide.com/products/slim-card-wallet", sessions: 870, users: 733 },
      { key: "https://tannerandhide.com/collections/sale", sessions: 640, users: 512 },
    ],
    trafficSources: [
      { key: "Organic Search", sessions: 11240, users: 8560 },
      { key: "Direct", sessions: 5320, users: 4180 },
      { key: "Paid Social", sessions: 3610, users: 3020 },
      { key: "Email", sessions: 2210, users: 1770 },
      { key: "Referral", sessions: 1480, users: 1190 },
      { key: "Organic Social", sessions: 1020, users: 860 },
    ],
    devices: [
      { key: "mobile", sessions: 14330, users: 10870 },
      { key: "desktop", sessions: 8790, users: 6240 },
      { key: "tablet", sessions: 1760, users: 1130 },
    ],
    countries: [
      { key: "Australia", sessions: 15210, users: 11200 },
      { key: "United States", sessions: 4230, users: 3180 },
      { key: "United Kingdom", sessions: 2110, users: 1590 },
      { key: "New Zealand", sessions: 1480, users: 1110 },
      { key: "Canada", sessions: 890, users: 671 },
      { key: "Germany", sessions: 410, users: 322 },
    ],
  },
  insights: {
    executiveSummary:
      "June was a standout month for Tanner & Hide. Organic search clicks grew 23% period-over-period on the back of improved rankings for the core bag and wallet keywords, and overall site traffic rose 18% to 24,880 sessions. Conversions climbed 27% to 812, generating $48,230 in tracked revenue — the strongest month this year. The paid social tests launched mid-month are already contributing 15% of sessions at a healthy engagement rate. The main watch-item is the decline in sale-related queries, which suggests promotional content needs a refresh before the July campaign.",
    keyWins: [
      "Organic clicks up 23% period-over-period, driven by page-one rankings for “handmade leather bags” (position 3.2).",
      "Revenue grew 34% to $48,230 with conversion rate improving from 3.1% to 3.3%.",
      "Average search position improved from 14.1 to 12.4 across the tracked keyword set.",
    ],
    issuesDetected: [
      "Sale-related queries lost 66% of their clicks — the /collections/sale landing page has thin content and no internal links from the blog.",
      "Tablet engagement rate (41%) trails mobile (63%); the product gallery renders poorly on iPad breakpoints.",
    ],
    growthOpportunities: [
      "“Mens leather duffle bag” sits at position 9.4 with 30,100 impressions — a dedicated buying guide could push it onto page one.",
      "Email drives only 9% of sessions but converts at 5.1%; growing the list via a leather-care download could lift revenue.",
    ],
    recommendedActions: [
      "Publish a duffle bag buying guide targeting the page-two keyword cluster and interlink from the two top blog posts.",
      "Rebuild the sale collection page with unique copy and feature it in the July newsletter.",
      "Fix the tablet gallery layout bug before the July paid-social push.",
      "Add a post-purchase email flow promoting the care kit (attach rate is currently 4%).",
    ],
  },
};

renderReportPdf({
  data,
  branding: {
    name: "Northbeam Digital",
    brand_color: "#4f46e5",
    website: "northbeamdigital.com",
    footer_text: "Questions about this report? Reply to this email or book a call with your account manager.",
    contact_email: "hello@northbeamdigital.com",
    logo_url: null,
  },
  clientName: "Tanner & Hide Co.",
  title: "Monthly Performance Report — June 2026",
  period: { start: "2026-06-01", end: "2026-06-30" },
}).then((buf) => {
  const out = process.argv[2] ?? "sample-report.pdf";
  writeFileSync(out, buf);
  console.log(`Wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
});

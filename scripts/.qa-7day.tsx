// A realistic 7-day report: a live account with a full week of genuine data
// across two sources. Nothing sparse about the account — the window is simply
// short, which is the case the composition system has never been measured on.
import { mkdirSync, writeFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderReportPdf } from "../src/lib/pdf";
import { ReportDocument } from "../src/components/ReportDocument";
import { BRANDING, CLIENT } from "./qa-scenarios";
import type { ReportBlock } from "../src/lib/integrations/blocks";

const PERIOD = { start: "2026-07-25", end: "2026-07-31" };
const days = Array.from({ length: 7 }, (_, i) => `2026-07-${25 + i}`);

const data = {
  gsc: {
    totals: { clicks: 3120, impressions: 68400, ctr: 0.046, position: 10.4 },
    previousTotals: { clicks: 2870, impressions: 64100, ctr: 0.045, position: 11.1 },
    topQueries: Array.from({ length: 6 }, (_, i) => ({
      key: `running shoes ${i}`, clicks: 260 - i * 25, impressions: 3400 - i * 200,
      ctr: 0.058, position: 4 + i,
    })),
    topPages: [
      { key: "https://acme.example/shoes", clicks: 900, impressions: 12000, ctr: 0.075, position: 4.2 },
      { key: "https://acme.example/sale", clicks: 540, impressions: 9000, ctr: 0.06, position: 6.1 },
    ],
    topCountries: [], topDevices: [],
    byDate: days.map((date, i) => ({
      date, clicks: 420 + i * 12, impressions: 9400 + i * 140, ctr: 0.046, position: 10.8 - i * 0.08,
    })),
    movers: {
      winners: [{ key: "carbon plate shoes", clicks: 180, prevClicks: 120, changePct: 50, position: 5.1 }],
      decliners: [],
      opportunities: [{ key: "shoes for beginners", clicks: 22, impressions: 2100, position: 10.9 }],
    },
  },
  ga4: null,
  blocks: [
    {
      sourceId: "meta_ads", sourceName: "Meta Ads", category: "paid", currency: "USD",
      kpis: [
        { label: "Spend", value: 980, previous: 910, format: "currency" },
        { label: "Impressions", value: 104000, previous: null, format: "number" },
        { label: "Clicks", value: 720, previous: null, format: "number" },
        { label: "Conversions", value: 26, previous: null, format: "number" },
        { label: "Cost per conversion", value: 37.7, previous: 41.4, format: "currency", lowerBetter: true },
      ],
      series: [
        { label: "Spend", format: "currency", points: days.map((date, i) => ({ date, value: 132 + i * 2 })) },
      ],
      tables: [],
      notes: [],
    } as unknown as ReportBlock,
  ],
  insights: null,
  meta: {
    periodDays: 7, requested: PERIOD, coverage: PERIOD,
    reportType: "cross_channel", periodLabel: "Last 7 days",
  },
};

mkdirSync(".qa", { recursive: true });
(async () => {
  const buf = await renderReportPdf({
    data, branding: BRANDING, clientName: CLIENT,
    title: "Acme Running Co — Weekly Report · 25–31 July 2026",
    period: PERIOD, generatedAt: "July 31, 2026",
  });
  writeFileSync(".qa/5-seven-day.pdf", buf);
  const html = renderToStaticMarkup(
    React.createElement(ReportDocument, {
      branding: {
        name: BRANDING.name, logo_url: BRANDING.logo_url, brand_color: BRANDING.brand_color,
        website: BRANDING.website, footer_text: BRANDING.footer_text,
      },
      clientName: CLIENT, title: "Acme Running Co — Weekly Report · 25–31 July 2026",
      period: PERIOD, data,
    }),
  );
  writeFileSync(".qa/5-seven-day.html", html);
  console.log(`pdf ${(buf.length / 1024).toFixed(0)}KB  html ${(html.length / 1024).toFixed(0)}KB`);
})();

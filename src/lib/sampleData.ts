import type { GscReportData } from "@/components/GscAnalytics";

// Illustrative Search Console data shown as a placeholder before a client has a
// real connection — so the dashboard and client pages never look empty.
// Clearly labelled "Sample data" wherever it's rendered.
const days = Array.from({ length: 28 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (27 - i));
  const clicks = Math.round(360 + 120 * Math.sin(i / 3) + i * 4);
  const impressions = Math.round(clicks * (15 + (i % 5)));
  return {
    date: d.toISOString().slice(0, 10),
    clicks,
    impressions,
    ctr: +(clicks / impressions).toFixed(4),
    position: +(9.4 - i * 0.05 + Math.sin(i / 2) * 0.4).toFixed(1),
  };
});

// Headline totals are fixed to clean demo figures.
export const SAMPLE_GSC: GscReportData = {
  totals: { clicks: 12450, impressions: 240000, ctr: 0.051, position: 8.4 },
  byDate: days,
  topQueries: [
    { key: "marketing agency near me", clicks: 1240, impressions: 18900 },
    { key: "best seo services", clicks: 980, impressions: 22400 },
    { key: "ppc management", clicks: 760, impressions: 14200 },
    { key: "social media marketing", clicks: 612, impressions: 16800 },
    { key: "google ads agency", clicks: 540, impressions: 9100 },
    { key: "local seo services", clicks: 430, impressions: 7700 },
  ],
};

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
    { key: "marketing agency near me", clicks: 1240, impressions: 18900, ctr: 0.066, position: 3.2 },
    { key: "best seo services", clicks: 980, impressions: 22400, ctr: 0.044, position: 4.8 },
    { key: "ppc management", clicks: 760, impressions: 14200, ctr: 0.054, position: 5.1 },
    { key: "social media marketing", clicks: 612, impressions: 16800, ctr: 0.036, position: 6.7 },
    { key: "google ads agency", clicks: 540, impressions: 9100, ctr: 0.059, position: 4.2 },
    { key: "local seo services", clicks: 430, impressions: 7700, ctr: 0.056, position: 5.9 },
  ],
  topPages: [
    { key: "https://example.com/", clicks: 3120, impressions: 58000, ctr: 0.054, position: 4.1 },
    { key: "https://example.com/services/seo", clicks: 1840, impressions: 31200, ctr: 0.059, position: 3.6 },
    { key: "https://example.com/services/ppc", clicks: 1290, impressions: 24800, ctr: 0.052, position: 5.0 },
    { key: "https://example.com/blog/local-seo-guide", clicks: 910, impressions: 19600, ctr: 0.046, position: 6.4 },
    { key: "https://example.com/contact", clicks: 540, impressions: 8900, ctr: 0.061, position: 4.5 },
    { key: "https://example.com/case-studies", clicks: 410, impressions: 7300, ctr: 0.056, position: 7.2 },
  ],
  topCountries: [
    { key: "United States", clicks: 7480, impressions: 142000, ctr: 0.053, position: 4.4 },
    { key: "United Kingdom", clicks: 1820, impressions: 36800, ctr: 0.049, position: 5.1 },
    { key: "Canada", clicks: 1140, impressions: 22400, ctr: 0.051, position: 4.9 },
    { key: "Australia", clicks: 860, impressions: 17600, ctr: 0.049, position: 5.6 },
    { key: "India", clicks: 620, impressions: 14900, ctr: 0.042, position: 6.8 },
    { key: "Germany", clicks: 430, impressions: 9200, ctr: 0.047, position: 5.4 },
  ],
  topDevices: [
    { key: "Mobile", clicks: 6850, impressions: 132000, ctr: 0.052, position: 4.9 },
    { key: "Desktop", clicks: 4980, impressions: 92000, ctr: 0.054, position: 4.1 },
    { key: "Tablet", clicks: 620, impressions: 16000, ctr: 0.039, position: 6.2 },
  ],
};

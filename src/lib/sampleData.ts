import type { GscReportData } from "@/components/GscAnalytics";
import type { Ga4ReportData } from "@/components/Ga4Analytics";
import type { SocialReport } from "@/lib/integrations/social";

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

// Illustrative GA4 data shown as a placeholder before a client connects GA4.
const ga4Days = Array.from({ length: 28 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (27 - i));
  const users = Math.round(520 + 140 * Math.sin(i / 3) + i * 6);
  return {
    date: d.toISOString().slice(0, 10),
    users,
    sessions: Math.round(users * 1.35),
    views: Math.round(users * 3.1),
  };
});

export const SAMPLE_GA4: Ga4ReportData = {
  totals: {
    users: 18420,
    newUsers: 12180,
    sessions: 24880,
    engagedSessions: 16410,
    engagementRate: 0.659,
    avgEngagementTime: 96,
    views: 57200,
    conversions: 642,
    totalRevenue: 18940,
  },
  byDate: ga4Days,
  topLandingPages: [
    { key: "/", sessions: 6240, users: 5100 },
    { key: "/services/seo", sessions: 3820, users: 3110 },
    { key: "/pricing", sessions: 2960, users: 2480 },
    { key: "/blog/local-seo-guide", sessions: 2140, users: 1890 },
    { key: "/contact", sessions: 1320, users: 1180 },
    { key: "/case-studies", sessions: 980, users: 870 },
  ],
  trafficSources: [
    { key: "Organic Search", sessions: 11200, users: 8900 },
    { key: "Direct", sessions: 6100, users: 5200 },
    { key: "Referral", sessions: 3200, users: 2600 },
    { key: "Organic Social", sessions: 2480, users: 2050 },
    { key: "Paid Search", sessions: 1900, users: 1480 },
  ],
  devices: [
    { key: "mobile", sessions: 14200, users: 10800 },
    { key: "desktop", sessions: 9100, users: 6900 },
    { key: "tablet", sessions: 1580, users: 1320 },
  ],
  countries: [
    { key: "United States", sessions: 14800, users: 11100 },
    { key: "United Kingdom", sessions: 3600, users: 2800 },
    { key: "Canada", sessions: 2300, users: 1850 },
    { key: "Australia", sessions: 1700, users: 1380 },
    { key: "India", sessions: 1280, users: 1020 },
    { key: "Germany", sessions: 900, users: 740 },
  ],
};

// Illustrative Instagram data shown as a placeholder before a client connects.
const socialDays = Array.from({ length: 28 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (27 - i));
  return {
    date: d.toISOString().slice(0, 10),
    reach: Math.round(2400 + 700 * Math.sin(i / 3) + i * 30),
    followerChange: Math.round(14 + 8 * Math.sin(i / 2)),
  };
});

export const SAMPLE_INSTAGRAM: SocialReport = {
  platform: "instagram",
  profile: {
    id: "0", username: "yourclient", name: "Your Client", picture: null,
    website: "https://example.com", followers: 24680, following: 412, mediaCount: 486,
  },
  totals: {
    followers: 24680, followerGrowth: 384, reach: 86400, impressions: 132000,
    profileViews: 5120, websiteClicks: 640, posts: 14, reels: 6, stories: 3,
    likes: 9240, comments: 812, shares: 356, saves: 1108,
    engagements: 11516, engagementRate: 0.047,
  },
  previousTotals: null,
  byDate: socialDays,
  topPosts: [
    { id: "s1", type: "reel", caption: "Behind the scenes: how we plan a launch week", permalink: null, timestamp: socialDays[24].date, likes: 2140, comments: 188, saves: 402, shares: 156 },
    { id: "s2", type: "post", caption: "5 storefront photos that convert (swipe)", permalink: null, timestamp: socialDays[20].date, likes: 1460, comments: 121, saves: 289, shares: 74 },
    { id: "s3", type: "reel", caption: "Client results: 3x bookings in 60 days", permalink: null, timestamp: socialDays[15].date, likes: 1230, comments: 96, saves: 214, shares: 88 },
    { id: "s4", type: "post", caption: "Meet the team — new faces this quarter", permalink: null, timestamp: socialDays[9].date, likes: 890, comments: 74, saves: 61, shares: 22 },
  ],
  notes: [],
};

// YouTube Analytics backend. Reuses the shared Google OAuth app (youtubeOAuth
// variant adds the yt-analytics + youtube read scopes). Channels are listed via
// the YouTube Data API; time-series metrics come from the YouTube Analytics API.
// Normalized into the VideoReport shape (metrics.ts) rendered by VideoAnalytics.
import type { IntegrationAccount } from "../types";
import { dayRange, withRetry, type VideoDay, type VideoReport, type VideoTotals } from "../metrics";

const DATA_API = "https://www.googleapis.com/youtube/v3";
const ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2";
const METRICS = "views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments";

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function ytGet<T>(url: string, accessToken: string): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429) throw new Error("YouTube rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { error?: { message?: string } }).error?.message ?? res.statusText;
      throw new Error(`YouTube API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

type ChannelItem = { id: string; snippet?: { title?: string }; statistics?: { subscriberCount?: string } };

// Lists the channels the authenticated user manages.
export async function listYoutubeChannels(accessToken: string): Promise<IntegrationAccount[]> {
  const data = await ytGet<{ items?: ChannelItem[] }>(
    `${DATA_API}/channels?part=snippet,statistics&mine=true&maxResults=50`, accessToken
  );
  return (data.items ?? []).map((c) => ({ id: c.id, name: c.snippet?.title ?? c.id }));
}

async function subscriberCount(accessToken: string, channelId: string): Promise<number> {
  try {
    const data = await ytGet<{ items?: ChannelItem[] }>(
      `${DATA_API}/channels?part=statistics&id=${channelId}`, accessToken
    );
    return Number(data.items?.[0]?.statistics?.subscriberCount ?? 0);
  } catch {
    return 0;
  }
}

type AnalyticsRow = (string | number)[];

async function analytics(accessToken: string, channelId: string, start: string, end: string, byDay: boolean): Promise<AnalyticsRow[]> {
  const params = new URLSearchParams({
    ids: `channel==${channelId}`,
    startDate: start,
    endDate: end,
    metrics: METRICS,
  });
  if (byDay) {
    params.set("dimensions", "day");
    params.set("sort", "day");
  }
  const data = await ytGet<{ rows?: AnalyticsRow[] }>(`${ANALYTICS_API}/reports?${params.toString()}`, accessToken);
  return data.rows ?? [];
}

// Column indices after the (optional) leading "day" dimension column.
function totalsFrom(rows: AnalyticsRow[], hasDay: boolean, subscribers: number): VideoTotals {
  const off = hasDay ? 1 : 0;
  const col = (r: AnalyticsRow, i: number) => Number(r[off + i] ?? 0);
  const views = rows.reduce((s, r) => s + col(r, 0), 0);
  const minutes = rows.reduce((s, r) => s + col(r, 1), 0);
  return {
    views,
    watchTimeMinutes: minutes,
    avgViewDurationSec: views > 0 ? Math.round((minutes * 60) / views) : 0,
    subscribers,
    subscribersGained: rows.reduce((s, r) => s + col(r, 2), 0),
    subscribersLost: rows.reduce((s, r) => s + col(r, 3), 0),
    likes: rows.reduce((s, r) => s + col(r, 4), 0),
    comments: rows.reduce((s, r) => s + col(r, 5), 0),
  };
}

// Fetches the normalized video report for one channel and period, plus the prior
// equal-length period for comparison. accountId = the YouTube channel id.
export async function fetchYoutubeReport(accessToken: string, channelId: string, periodDays: number): Promise<VideoReport> {
  // YouTube Analytics finalizes with a lag; end the window 2 days back.
  const start = isoDaysAgo(periodDays + 2);
  const end = isoDaysAgo(2);
  const prevStart = isoDaysAgo(periodDays * 2 + 2);
  const prevEnd = isoDaysAgo(periodDays + 3);

  const [subscribers, dailyRows, prevRows] = await Promise.all([
    subscriberCount(accessToken, channelId),
    analytics(accessToken, channelId, start, end, true),
    analytics(accessToken, channelId, prevStart, prevEnd, false).catch(() => [] as AnalyticsRow[]),
  ]);

  const byDayMap = new Map<string, VideoDay>();
  for (const d of dayRange(periodDays, 2)) byDayMap.set(d, { date: d, views: 0, watchTimeMinutes: 0, subscribersGained: 0 });
  for (const r of dailyRows) {
    const day = byDayMap.get(String(r[0]));
    if (day) {
      day.views += Number(r[1] ?? 0);
      day.watchTimeMinutes += Number(r[2] ?? 0);
      day.subscribersGained += Number(r[3] ?? 0);
    }
  }

  return {
    platform: "youtube_analytics",
    totals: totalsFrom(dailyRows, true, subscribers),
    previousTotals: prevRows.length ? totalsFrom(prevRows, false, subscribers) : null,
    byDate: Array.from(byDayMap.values()),
  };
}

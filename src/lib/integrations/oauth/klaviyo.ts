// Klaviyo backend. Uses a private API key (Klaviyo's official server-side auth)
// rather than OAuth, so it connects through the generic api-key flow: the key is
// verified against /api/accounts, then stored and used as a bearer-style header.
// Email metrics are read from Klaviyo's metric-aggregates endpoint and mapped
// into the shared EmailReport shape (metrics.ts), the same one Mailchimp fills.
import type { IntegrationAccount } from "../types";
import {
  dayRange, isoDay, ratio, withRetry, type EmailDay, type EmailReport, type EmailTotals,
} from "../metrics";

const BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-10-15";

function headers(apiKey: string, post = false): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: REVISION,
    accept: "application/vnd.api+json",
  };
  if (post) h["content-type"] = "application/vnd.api+json";
  return h;
}

async function kGet<T>(apiKey: string, path: string): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${BASE}${path}`, { headers: headers(apiKey) });
    if (res.status === 429) throw new Error("Klaviyo rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { errors?: { detail?: string }[] }).errors?.[0]?.detail ?? res.statusText;
      throw new Error(`Klaviyo API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

async function kPost<T>(apiKey: string, path: string, body: unknown): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers: headers(apiKey, true), body: JSON.stringify(body) });
    if (res.status === 429) throw new Error("Klaviyo rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { errors?: { detail?: string }[] }).errors?.[0]?.detail ?? res.statusText;
      throw new Error(`Klaviyo API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

// Verifies the private key and returns the Klaviyo account as the sole account.
export async function verifyKlaviyoKey(fields: Record<string, string>): Promise<{ displayName: string; token: string; accounts: IntegrationAccount[] }> {
  const apiKey = fields.apiKey;
  if (!apiKey) throw new Error("A Klaviyo private API key is required.");
  const data = await kGet<{ data?: { id: string; attributes?: { contact_information?: { organization_name?: string } } }[] }>(
    apiKey, "/accounts/"
  );
  const acc = data.data?.[0];
  if (!acc) throw new Error("Couldn't read the Klaviyo account for this key.");
  const name = acc.attributes?.contact_information?.organization_name || `Klaviyo (${acc.id})`;
  return { displayName: name, token: apiKey, accounts: [{ id: acc.id, name }] };
}

// name → id map for the built-in email metrics we need.
async function metricIds(apiKey: string): Promise<Record<string, string>> {
  const data = await kGet<{ data?: { id: string; attributes?: { name?: string } }[] }>(
    apiKey, "/metrics/?fields[metric]=name"
  );
  const map: Record<string, string> = {};
  for (const m of data.data ?? []) if (m.attributes?.name) map[m.attributes.name] = m.id;
  return map;
}

type Aggregate = { dates: string[]; counts: number[] };

// Daily count series for one metric over [since, until).
async function metricSeries(apiKey: string, metricId: string, since: string, until: string): Promise<Aggregate> {
  const body = {
    data: {
      type: "metric-aggregate",
      attributes: {
        metric_id: metricId,
        measurements: ["count"],
        interval: "day",
        timezone: "UTC",
        filter: [`greater-or-equal(datetime,${since}T00:00:00)`, `less-than(datetime,${until}T00:00:00)`],
        page_size: 500,
      },
    },
  };
  const res = await kPost<{ data?: { attributes?: { dates?: string[]; data?: { measurements?: { count?: number[] } }[] } } }>(
    apiKey, "/metric-aggregates/", body
  );
  const attrs = res.data?.attributes;
  return { dates: (attrs?.dates ?? []).map((d) => d.slice(0, 10)), counts: attrs?.data?.[0]?.measurements?.count ?? [] };
}

const sum = (a?: number[]) => (a ?? []).reduce((s, n) => s + (n ?? 0), 0);

function totalsFrom(sent: Aggregate, opens: Aggregate, clicks: Aggregate, subs: number, unsubs: number, campaigns: number): EmailTotals {
  const emailsSent = sum(sent.counts);
  const o = sum(opens.counts);
  const c = sum(clicks.counts);
  return {
    subscribers: 0, // Klaviyo exposes no cheap global subscriber count; growth is tracked via newSubscribers.
    newSubscribers: subs,
    unsubscribes: unsubs,
    campaigns,
    emailsSent,
    opens: o,
    openRate: ratio(o, emailsSent),
    clicks: c,
    clickRate: ratio(c, emailsSent),
  };
}

// Fetches the normalized email report for the account and period, plus the prior
// equal-length period for comparison. accountId = the Klaviyo account id.
export async function fetchKlaviyoReport(apiKey: string, _accountId: string, periodDays: number): Promise<EmailReport> {
  const since = isoDay(periodDays);
  const until = isoDay(0); // exclusive upper bound = today
  const prevSince = isoDay(periodDays * 2);
  const prevUntil = isoDay(periodDays);

  const ids = await metricIds(apiKey);
  const idOf = (name: string) => ids[name];
  const series = async (name: string, a: string, b: string): Promise<Aggregate> => {
    const id = idOf(name);
    if (!id) return { dates: [], counts: [] };
    return metricSeries(apiKey, id, a, b).catch(() => ({ dates: [], counts: [] }));
  };

  const [sent, opens, clicks, subsAgg, unsubAgg, prevSent, prevOpens, prevClicks, prevSubs, prevUnsub, campaigns] = await Promise.all([
    series("Received Email", since, until),
    series("Opened Email", since, until),
    series("Clicked Email", since, until),
    series("Subscribed to List", since, until),
    series("Unsubscribed", since, until),
    series("Received Email", prevSince, prevUntil),
    series("Opened Email", prevSince, prevUntil),
    series("Clicked Email", prevSince, prevUntil),
    series("Subscribed to List", prevSince, prevUntil),
    series("Unsubscribed", prevSince, prevUntil),
    kGet<{ data?: { attributes?: { name?: string; send_time?: string }; id: string }[] }>(
      apiKey,
      `/campaigns/?filter=and(equals(messages.channel,'email'),greater-or-equal(created_at,${since}T00:00:00Z))` +
      `&fields[campaign]=name,send_time&sort=-created_at&page[size]=8`
    ).catch(() => ({ data: [] as { attributes?: { name?: string; send_time?: string }; id: string }[] })),
  ]);

  // Zero-filled daily series keyed by date.
  const byDayMap = new Map<string, EmailDay>();
  for (const d of dayRange(periodDays, 0)) byDayMap.set(d, { date: d, sent: 0, opens: 0, clicks: 0 });
  const apply = (agg: Aggregate, key: "sent" | "opens" | "clicks") => {
    agg.dates.forEach((d, i) => {
      const row = byDayMap.get(d);
      if (row) row[key] += agg.counts[i] ?? 0;
    });
  };
  apply(sent, "sent");
  apply(opens, "opens");
  apply(clicks, "clicks");

  const camps = campaigns.data ?? [];
  const anyPrev = sum(prevSent.counts) + sum(prevOpens.counts) + sum(prevClicks.counts) > 0;

  return {
    platform: "klaviyo",
    totals: totalsFrom(sent, opens, clicks, sum(subsAgg.counts), sum(unsubAgg.counts), camps.length),
    previousTotals: anyPrev ? totalsFrom(prevSent, prevOpens, prevClicks, sum(prevSubs.counts), sum(prevUnsub.counts), 0) : null,
    byDate: Array.from(byDayMap.values()),
    topCampaigns: camps.map((c) => ({
      name: c.attributes?.name ?? "—",
      sentAt: (c.attributes?.send_time ?? "").slice(0, 10),
      sent: 0, // per-campaign counts require the (conversion-metric-bound) reporting API; omitted.
      openRate: 0,
      clickRate: 0,
    })),
  };
}

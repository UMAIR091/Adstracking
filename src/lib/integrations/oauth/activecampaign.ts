// ActiveCampaign backend (API v3). ActiveCampaign has no public OAuth — it
// authenticates with an account-specific API URL + API token (Api-Token header),
// so it connects through the generic api-key flow. Both values are needed on
// every call, so they're stored together as "<apiKey>|<apiUrl>" in the encrypted
// access_token column (the same two-values-in-one pattern Moz/X/Salesforce use).
//
// Metrics normalize into the shared EmailReport (EmailAnalytics), the same shape
// Mailchimp and Klaviyo fill — no new visualization code.
import type { IntegrationAccount } from "../types";
import { assertPublicUrl } from "@/lib/ssrf";
import { dayRange, ratio, withRetry, type EmailCampaign, type EmailDay, type EmailReport, type EmailTotals } from "../metrics";

function pack(apiKey: string, apiUrl: string): string {
  return `${apiKey}|${apiUrl}`;
}
function unpack(stored: string): { apiKey: string; apiUrl: string } {
  const i = stored.indexOf("|");
  if (i < 0) throw new Error("Malformed ActiveCampaign credential — please reconnect.");
  return { apiKey: stored.slice(0, i), apiUrl: stored.slice(i + 1) };
}

// Accepts "acct.api-us1.com" or "https://acct.api-us1.com/" and normalizes.
function normalizeUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function acGet<T>(stored: string, path: string, params?: Record<string, string>): Promise<T> {
  const { apiKey, apiUrl } = unpack(stored);
  await assertPublicUrl(apiUrl); // SSRF guard: block internal/metadata addresses
  return withRetry(async () => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    const res = await fetch(`${apiUrl}/api/3${path}${qs}`, {
      headers: { "Api-Token": apiKey, Accept: "application/json" },
    });
    if (res.status === 429) throw new Error("ActiveCampaign rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { message?: string; errors?: { title?: string }[] }).errors?.[0]?.title
        ?? (data as { message?: string }).message ?? res.statusText;
      throw new Error(`ActiveCampaign API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

// Verifies the API URL + token with a lightweight authenticated call. Throws a
// provider-specific error so an invalid credential is never saved.
export async function verifyActiveCampaignKey(fields: Record<string, string>): Promise<{ displayName: string; token: string; accounts: IntegrationAccount[] }> {
  const apiKey = (fields.apiKey ?? "").trim();
  const apiUrl = normalizeUrl(fields.apiUrl ?? "");
  if (!apiUrl) throw new Error("Your ActiveCampaign API URL is required (Settings → Developer).");
  if (!apiKey) throw new Error("An ActiveCampaign API key is required (Settings → Developer).");

  const stored = pack(apiKey, apiUrl);
  try {
    await acGet<{ meta?: unknown }>(stored, "/contacts", { limit: "1" });
  } catch (err) {
    const msg = (err as Error).message;
    if (/\(40[13]\)/.test(msg)) throw new Error("ActiveCampaign rejected that API key. Check Settings → Developer for the correct URL and key.");
    if (/\(404\)/.test(msg)) throw new Error("That ActiveCampaign API URL wasn't found. It looks like https://youraccount.api-us1.com");
    throw err;
  }

  const host = apiUrl.replace(/^https?:\/\//, "");
  return { displayName: host, token: stored, accounts: [{ id: host, name: host }] };
}

type Meta = { meta?: { total?: string | number } };
type AcCampaign = {
  name?: string; sdate?: string; status?: string;
  send_amt?: string; opens?: string; uniqueopens?: string;
  linkclicks?: string; uniquelinkclicks?: string; unsubscribes?: string;
};

const n = (v: string | number | undefined): number => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
};

async function total(stored: string, path: string, params: Record<string, string>): Promise<number> {
  const data = await acGet<Meta>(stored, path, { ...params, limit: "1" });
  return n(data.meta?.total);
}

// Campaigns sent within [since, until).
async function campaignsSince(stored: string, since: string, until: string): Promise<AcCampaign[]> {
  const data = await acGet<{ campaigns?: AcCampaign[] }>(stored, "/campaigns", {
    "filters[sdate_gte]": since,
    "filters[sdate_lt]": until,
    "orders[sdate]": "DESC",
    limit: "100",
  });
  return data.campaigns ?? [];
}

function totalsFrom(campaigns: AcCampaign[], subscribers: number, newSubscribers: number): EmailTotals {
  const emailsSent = campaigns.reduce((s, c) => s + n(c.send_amt), 0);
  const opens = campaigns.reduce((s, c) => s + n(c.uniqueopens), 0);
  const clicks = campaigns.reduce((s, c) => s + n(c.uniquelinkclicks), 0);
  return {
    subscribers,
    newSubscribers,
    unsubscribes: campaigns.reduce((s, c) => s + n(c.unsubscribes), 0),
    campaigns: campaigns.length,
    emailsSent,
    opens,
    openRate: ratio(opens, emailsSent),
    clicks,
    clickRate: ratio(clicks, emailsSent),
  };
}

// Fetches the normalized email report for the account and period, plus the prior
// equal-length period. accountId is the account host (the credential carries the URL).
export async function fetchActiveCampaignReport(stored: string, _accountId: string, periodDays: number): Promise<EmailReport> {
  const days = dayRange(periodDays);
  const since = days[0];
  const until = new Date(Date.now()).toISOString().slice(0, 10);
  const prevSince = dayRange(periodDays * 2)[0];

  const [subscribers, newSubscribers, campaigns, prevCampaigns] = await Promise.all([
    total(stored, "/contacts", {}).catch(() => 0),
    total(stored, "/contacts", { "filters[created_after]": since }).catch(() => 0),
    campaignsSince(stored, since, until).catch(() => [] as AcCampaign[]),
    campaignsSince(stored, prevSince, since).catch(() => [] as AcCampaign[]),
  ]);

  // ActiveCampaign has no daily series endpoint — bucket each campaign's results
  // onto its send date, zero-filling the rest of the range.
  const byDay = new Map<string, EmailDay>();
  for (const d of days) byDay.set(d, { date: d, sent: 0, opens: 0, clicks: 0 });
  for (const c of campaigns) {
    const day = byDay.get((c.sdate ?? "").slice(0, 10));
    if (!day) continue;
    day.sent += n(c.send_amt);
    day.opens += n(c.uniqueopens);
    day.clicks += n(c.uniquelinkclicks);
  }

  const topCampaigns: EmailCampaign[] = campaigns
    .map((c) => {
      const sent = n(c.send_amt);
      return {
        name: c.name ?? "—",
        sentAt: (c.sdate ?? "").slice(0, 10),
        sent,
        openRate: ratio(n(c.uniqueopens), sent),
        clickRate: ratio(n(c.uniquelinkclicks), sent),
      };
    })
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 10);

  return {
    platform: "activecampaign",
    totals: totalsFrom(campaigns, subscribers, newSubscribers),
    previousTotals: prevCampaigns.length ? totalsFrom(prevCampaigns, subscribers, 0) : null,
    byDate: Array.from(byDay.values()),
    topCampaigns,
  };
}

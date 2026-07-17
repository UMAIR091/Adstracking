// Salesforce backend (REST + SOQL). OAuth 2.0 web-server flow with refresh.
//
// Salesforce is per-org: the token response carries an instance_url that every
// API call must target, and it returns no expires_in. Both facts are handled by
// packing "<access_token>|<instance_url>" into the encrypted access_token column
// (the same two-values-in-one pattern Moz and X Ads use) and assigning a
// conservative session horizon so the shared refresh flow keeps it alive. An
// instance_url never contains "|", so the split is unambiguous.
//
// Leads/Opportunities normalize into the shared CrmReport (CrmAnalytics), the
// same shape HubSpot fills — no new visualization code.
import type { IntegrationAccount, OAuthProvider, TokenSet } from "../types";
import { dayRange, isoDay, withRetry, type CrmDay, type CrmReport } from "../metrics";

const API_VERSION = "v60.0";
// Salesforce access tokens expire per the org's session policy (no expires_in in
// the response); 2h is the common default, and refresh covers an early expiry.
const SESSION_SECONDS = 2 * 60 * 60;

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function salesforceConfigured(): boolean {
  return Boolean(process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET);
}

// Sandboxes authenticate against test.salesforce.com.
function loginUrl(): string {
  return process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
}

function redirectUri(): string {
  return `${env("NEXT_PUBLIC_APP_URL")}/api/salesforce/callback`;
}

function pack(accessToken: string, instanceUrl: string): string {
  return `${accessToken}|${instanceUrl}`;
}
function unpack(stored: string): { token: string; instanceUrl: string } {
  const i = stored.indexOf("|");
  if (i < 0) throw new Error("Malformed Salesforce credential — please reconnect.");
  return { token: stored.slice(0, i), instanceUrl: stored.slice(i + 1) };
}

type TokenResponse = { access_token?: string; refresh_token?: string; instance_url?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${loginUrl()}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env("SALESFORCE_CLIENT_ID"),
      client_secret: env("SALESFORCE_CLIENT_SECRET"),
      ...body,
    }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token || !data.instance_url) {
    throw new Error(`Salesforce token request failed: ${data.error_description ?? res.statusText} (${res.status})`);
  }
  return {
    access_token: pack(data.access_token, data.instance_url),
    refresh_token: data.refresh_token,
    expires_in: SESSION_SECONDS,
  };
}

export const salesforceOAuth: OAuthProvider = {
  id: "salesforce",
  authUrl(state) {
    const params = new URLSearchParams({
      client_id: env("SALESFORCE_CLIENT_ID"),
      redirect_uri: redirectUri(),
      response_type: "code",
      // refresh_token is required to keep syncing; api grants REST/SOQL access.
      scope: "api refresh_token",
      state,
    });
    return `${loginUrl()}/services/oauth2/authorize?${params.toString()}`;
  },
  exchangeCode(code) {
    return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  },
  async refresh(refreshToken) {
    // Salesforce omits refresh_token on refresh — carry the existing one forward.
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken };
  },
  async identity(accessToken) {
    try {
      const org = await fetchOrg(accessToken);
      return org.name;
    } catch {
      return "Salesforce org";
    }
  },
  callbackPath: "/api/salesforce/callback",
};

// ── SOQL ─────────────────────────────────────────────────────

type QueryResult<T> = { records?: T[]; totalSize?: number };

async function soql<T>(stored: string, query: string): Promise<T[]> {
  const { token, instanceUrl } = unpack(stored);
  return withRetry(async () => {
    const url = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (res.status === 429) throw new Error("Salesforce rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Salesforce returns errors as [{ message, errorCode }].
      const detail = Array.isArray(data) ? (data[0]?.message ?? res.statusText) : res.statusText;
      throw new Error(`Salesforce API error: ${detail} (${res.status})`);
    }
    return ((data as QueryResult<T>).records ?? []) as T[];
  });
}

async function fetchOrg(stored: string): Promise<{ id: string; name: string; currency: string }> {
  const rows = await soql<{ Id: string; Name?: string; DefaultCurrencyIsoCode?: string }>(
    stored, "SELECT Id, Name, DefaultCurrencyIsoCode FROM Organization LIMIT 1"
  );
  const org = rows[0];
  return { id: org?.Id ?? "org", name: org?.Name ?? "Salesforce org", currency: org?.DefaultCurrencyIsoCode ?? "USD" };
}

// A Salesforce connection maps to exactly one org, so that's the sole account.
export async function listSalesforceOrgs(accessToken: string): Promise<IntegrationAccount[]> {
  const org = await fetchOrg(accessToken);
  return [{ id: org.id, name: org.name }];
}

// SOQL datetime literals are unquoted ISO-8601.
const dt = (daysAgo: number) => `${isoDay(daysAgo)}T00:00:00Z`;

const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

type DayCount = { d?: string; c?: number };

// Per-day counts for an object's CreatedDate, grouped in SOQL.
async function dailyCounts(stored: string, sobject: string, since: string, until: string): Promise<Map<string, number>> {
  const rows = await soql<DayCount>(
    stored,
    `SELECT DAY_ONLY(CreatedDate) d, COUNT(Id) c FROM ${sobject} WHERE CreatedDate >= ${since} AND CreatedDate < ${until} GROUP BY DAY_ONLY(CreatedDate)`
  );
  const map = new Map<string, number>();
  for (const r of rows) if (r.d) map.set(String(r.d).slice(0, 10), n(r.c));
  return map;
}

async function wonTotals(stored: string, since: string, until: string): Promise<{ deals: number; revenue: number }> {
  const rows = await soql<{ c?: number; s?: number }>(
    stored,
    `SELECT COUNT(Id) c, SUM(Amount) s FROM Opportunity WHERE IsWon = true AND CloseDate >= ${since.slice(0, 10)} AND CloseDate < ${until.slice(0, 10)}`
  );
  return { deals: n(rows[0]?.c), revenue: n(rows[0]?.s) };
}

async function countSince(stored: string, sobject: string, since: string, until: string): Promise<number> {
  const rows = await soql<{ c?: number }>(
    stored, `SELECT COUNT(Id) c FROM ${sobject} WHERE CreatedDate >= ${since} AND CreatedDate < ${until}`
  );
  return n(rows[0]?.c);
}

// Fetches the normalized CRM report for the org and period, plus the prior
// equal-length period for comparison. accountId (the org id) is implicit in the
// connection's instance_url.
export async function fetchSalesforceReport(stored: string, _orgId: string, periodDays: number): Promise<CrmReport> {
  const since = dt(periodDays);
  const until = dt(0);
  const prevSince = dt(periodDays * 2);
  const prevUntil = since;

  const [org, leadDays, oppDays, won, topDeals, prevLeads, prevOpps, prevWon] = await Promise.all([
    fetchOrg(stored).catch(() => ({ id: "org", name: "Salesforce org", currency: "USD" })),
    dailyCounts(stored, "Lead", since, until).catch(() => new Map<string, number>()),
    dailyCounts(stored, "Opportunity", since, until).catch(() => new Map<string, number>()),
    wonTotals(stored, since, until).catch(() => ({ deals: 0, revenue: 0 })),
    soql<{ Name?: string; Amount?: number; StageName?: string; CreatedDate?: string }>(
      stored,
      `SELECT Name, Amount, StageName, CreatedDate FROM Opportunity WHERE CreatedDate >= ${since} AND CreatedDate < ${until} ORDER BY Amount DESC NULLS LAST LIMIT 10`
    ).catch(() => []),
    countSince(stored, "Lead", prevSince, prevUntil).catch(() => 0),
    countSince(stored, "Opportunity", prevSince, prevUntil).catch(() => 0),
    wonTotals(stored, prevSince, prevUntil).catch(() => ({ deals: 0, revenue: 0 })),
  ]);

  const byDate: CrmDay[] = dayRange(periodDays).map((d) => ({
    date: d,
    contacts: leadDays.get(d) ?? 0,
    deals: oppDays.get(d) ?? 0,
  }));

  const newContacts = byDate.reduce((s, r) => s + r.contacts, 0);
  const newDeals = byDate.reduce((s, r) => s + r.deals, 0);
  const hasPrev = prevLeads > 0 || prevOpps > 0 || prevWon.deals > 0;

  return {
    platform: "salesforce",
    currency: org.currency,
    totals: { newContacts, newDeals, wonDeals: won.deals, wonRevenue: won.revenue },
    previousTotals: hasPrev
      ? { newContacts: prevLeads, newDeals: prevOpps, wonDeals: prevWon.deals, wonRevenue: prevWon.revenue }
      : null,
    byDate,
    topDeals: topDeals.map((d) => ({
      name: d.Name ?? "—",
      amount: n(d.Amount),
      stage: d.StageName ?? "—",
      createdAt: (d.CreatedDate ?? "").slice(0, 10),
    })),
  };
}

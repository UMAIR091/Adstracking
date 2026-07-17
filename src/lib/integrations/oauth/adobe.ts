// Adobe Analytics backend (Analytics 2.0 API) with Adobe IMS OAuth 2.0.
//
// Adobe is two-level: an IMS org exposes one or more companies (globalCompanyId),
// each with report suites (rsid). Reports need BOTH, so an "account" here is the
// composite "<globalCompanyId>:<rsid>" — neither part contains a colon, so the
// first-colon split is unambiguous and the shared single-account picker still
// works unchanged.
//
// Metrics map onto the existing Ga4ReportData shape (visitors→users,
// visits→sessions, pageviews→views), so Adobe reuses Ga4Analytics with no new
// visualization code.
//
// NOTE ON VERIFICATION: Adobe's Analytics API requires an enterprise Adobe
// Developer Console project and product access, so the reporting response shape
// below is implemented to the documented 2.0 contract with defensive parsing and
// should be confirmed against a live report suite.
import type { IntegrationAccount, OAuthProvider, TokenSet } from "../types";
import { dayRange, withRetry } from "../metrics";
import type { Ga4ReportData } from "@/components/Ga4Analytics";

const IMS = "https://ims-na1.adobelogin.com/ims";
const API = "https://analytics.adobe.io";
const SCOPES = ["openid", "AdobeID", "read_organizations", "additional_info.projectedProductContext"];
// Column order for the daily report — indexes must match METRIC_IDS.
const METRIC_IDS = [
  "metrics/visitors",
  "metrics/visits",
  "metrics/pageviews",
  "metrics/bouncerate",
  "metrics/averagetimespentonsite",
  "metrics/orders",
  "metrics/revenue",
];

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function adobeConfigured(): boolean {
  return Boolean(process.env.ADOBE_CLIENT_ID && process.env.ADOBE_CLIENT_SECRET);
}

function redirectUri(): string {
  return `${env("NEXT_PUBLIC_APP_URL")}/api/adobe/callback`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${IMS}/token/v3`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env("ADOBE_CLIENT_ID"),
      client_secret: env("ADOBE_CLIENT_SECRET"),
      ...body,
    }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Adobe token request failed: ${data.error_description ?? res.statusText} (${res.status})`);
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in ?? 86400 };
}

// Adobe requires the client id as x-api-key on every Analytics call, plus the
// company id for company-scoped endpoints.
async function adobeFetch<T>(url: string, accessToken: string, companyId?: string, init?: RequestInit): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-api-key": env("ADOBE_CLIENT_ID"),
        ...(companyId ? { "x-proxy-global-company-id": companyId } : {}),
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 429) throw new Error("Adobe Analytics rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { error_description?: string; message?: string }).error_description
        ?? (data as { message?: string }).message ?? res.statusText;
      throw new Error(`Adobe Analytics API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

export const adobeOAuth: OAuthProvider = {
  id: "adobe",
  authUrl(state) {
    const params = new URLSearchParams({
      client_id: env("ADOBE_CLIENT_ID"),
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES.join(","),
      state,
    });
    return `${IMS}/authorize/v2?${params.toString()}`;
  },
  exchangeCode(code) {
    return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  },
  async refresh(refreshToken) {
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken };
  },
  async identity(accessToken) {
    try {
      const me = await discovery(accessToken);
      return me[0]?.companyName ?? "Adobe Analytics";
    } catch {
      return "Adobe Analytics";
    }
  },
  callbackPath: "/api/adobe/callback",
};

type Discovery = { imsOrgs?: { imsOrgId?: string; companies?: { globalCompanyId?: string; companyName?: string }[] }[] };

async function discovery(accessToken: string): Promise<{ companyId: string; companyName: string }[]> {
  const data = await adobeFetch<Discovery>(`${API}/discovery/me`, accessToken);
  const out: { companyId: string; companyName: string }[] = [];
  for (const org of data.imsOrgs ?? []) {
    for (const c of org.companies ?? []) {
      if (c.globalCompanyId) out.push({ companyId: c.globalCompanyId, companyName: c.companyName ?? c.globalCompanyId });
    }
  }
  return out;
}

// Lists every report suite across the user's companies as "<companyId>:<rsid>".
export async function listAdobeReportSuites(accessToken: string): Promise<IntegrationAccount[]> {
  const companies = await discovery(accessToken);
  const accounts: IntegrationAccount[] = [];
  for (const c of companies.slice(0, 10)) {
    try {
      const data = await adobeFetch<{ content?: { rsid?: string; name?: string }[] }>(
        `${API}/api/${encodeURIComponent(c.companyId)}/collections/suites?limit=100`, accessToken, c.companyId
      );
      for (const s of data.content ?? []) {
        if (s.rsid) accounts.push({ id: `${c.companyId}:${s.rsid}`, name: `${c.companyName} — ${s.name ?? s.rsid}` });
      }
    } catch {
      // Skip a company we can't read rather than failing the whole listing.
    }
  }
  return accounts;
}

function splitAccount(accountId: string): { companyId: string; rsid: string } {
  const i = accountId.indexOf(":");
  if (i < 0) throw new Error("Malformed Adobe report suite selection — please reconnect.");
  return { companyId: accountId.slice(0, i), rsid: accountId.slice(i + 1) };
}

type ReportRow = { value?: string; data?: number[] };
type ReportResponse = { rows?: ReportRow[]; summaryData?: { totals?: number[] } };

function dateRangeFilter(periodDays: number): string {
  const days = dayRange(periodDays);
  return `${days[0]}T00:00:00.000/${days[days.length - 1]}T23:59:59.999`;
}

async function runReport(
  accessToken: string, companyId: string, rsid: string, periodDays: number, dimension: string, metricIds: string[]
): Promise<ReportResponse> {
  return adobeFetch<ReportResponse>(`${API}/api/${encodeURIComponent(companyId)}/reports`, accessToken, companyId, {
    method: "POST",
    body: JSON.stringify({
      rsid,
      globalFilters: [{ type: "dateRange", dateRange: dateRangeFilter(periodDays) }],
      metricContainer: { metrics: metricIds.map((id, i) => ({ columnId: String(i), id })) },
      dimension,
      settings: { countRepeatInstances: true, limit: 400, page: 0 },
    }),
  });
}

const at = (arr: number[] | undefined, i: number): number => {
  const v = arr?.[i];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};

// Best-effort dimension breakdown → the {key, sessions, users} shape Ga4Analytics renders.
async function breakdown(
  accessToken: string, companyId: string, rsid: string, periodDays: number, dimension: string
): Promise<{ key: string; sessions: number; users: number }[]> {
  const res = await runReport(accessToken, companyId, rsid, periodDays, dimension, ["metrics/visits", "metrics/visitors"]);
  return (res.rows ?? [])
    .map((r) => ({ key: r.value ?? "—", sessions: at(r.data, 0), users: at(r.data, 1) }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);
}

// Fetches the normalized analytics report for one report suite and period.
// accountId = "<globalCompanyId>:<rsid>".
export async function fetchAdobeReport(accessToken: string, accountId: string, periodDays: number): Promise<Ga4ReportData> {
  const { companyId, rsid } = splitAccount(accountId);

  const [daily, pages, countries, sources, devices] = await Promise.all([
    runReport(accessToken, companyId, rsid, periodDays, "variables/daterangeday", METRIC_IDS),
    breakdown(accessToken, companyId, rsid, periodDays, "variables/page").catch(() => []),
    breakdown(accessToken, companyId, rsid, periodDays, "variables/geocountry").catch(() => []),
    breakdown(accessToken, companyId, rsid, periodDays, "variables/referrertype").catch(() => []),
    breakdown(accessToken, companyId, rsid, periodDays, "variables/mobiledevicetype").catch(() => []),
  ]);

  // Adobe returns one row per day in range order. Prefer parsing the row's date
  // value; fall back to positional mapping when it isn't a parseable date.
  const days = dayRange(periodDays);
  const byDate = (daily.rows ?? []).map((r, i) => {
    const parsed = r.value ? new Date(r.value) : null;
    const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : (days[i] ?? days[days.length - 1]);
    return { date, users: at(r.data, 0), sessions: at(r.data, 1), views: at(r.data, 2) };
  });

  const t = daily.summaryData?.totals;
  const visits = at(t, 1);
  const bounceRate = at(t, 3); // Adobe reports bounce rate as 0..1
  return {
    totals: {
      users: at(t, 0),
      newUsers: 0, // no direct Adobe equivalent in the standard metric set
      sessions: visits,
      engagedSessions: Math.round(visits * (1 - bounceRate)),
      engagementRate: 1 - bounceRate,
      avgEngagementTime: at(t, 4),
      views: at(t, 2),
      conversions: at(t, 5),
      totalRevenue: at(t, 6),
    },
    byDate,
    topLandingPages: pages,
    countries,
    trafficSources: sources,
    devices,
  };
}

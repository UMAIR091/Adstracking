// Pure HTTP helpers for Google OAuth + Search Console. No DB access here.

const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";
const GSC = "https://www.googleapis.com/webmasters/v3";

// Request Search Console now + Analytics (for Phase 6) so users connect once.
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: env("GOOGLE_OAUTH_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${OAUTH_AUTH}?${params.toString()}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: env("GOOGLE_OAUTH_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return res.json();
}

export async function getGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return "google account";
  const data = await res.json();
  return data.email ?? "google account";
}

export async function listGscSites(accessToken: string): Promise<string[]> {
  const res = await fetch(`${GSC}/sites`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Listing Search Console sites failed: ${await res.text()}`);
  const data = await res.json();
  return (data.siteEntry ?? [])
    .filter((s: { permissionLevel?: string }) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s: { siteUrl: string }) => s.siteUrl);
}

export type GscRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };
export type GscDay = { date: string; clicks: number; impressions: number; ctr: number; position: number };

export type GscReport = {
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  topQueries: GscRow[];
  topPages: GscRow[];
  byDate: GscDay[];
};

async function gscQuery(accessToken: string, siteUrl: string, body: object) {
  const res = await fetch(`${GSC}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Search Console query failed: ${await res.text()}`);
  return res.json();
}

// Lightweight single-query fetch of period totals — used to compare the current
// reporting period against the previous one without pulling full dimension data.
export async function fetchGscTotals(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<GscReport["totals"]> {
  const res = await gscQuery(accessToken, siteUrl, { startDate, endDate });
  const t = res.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return { clicks: t.clicks, impressions: t.impressions, ctr: t.ctr, position: t.position };
}

export async function fetchGscReport(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<GscReport> {
  const [totalsRes, queriesRes, pagesRes, dateRes] = await Promise.all([
    gscQuery(accessToken, siteUrl, { startDate, endDate }),
    gscQuery(accessToken, siteUrl, { startDate, endDate, dimensions: ["query"], rowLimit: 10 }),
    gscQuery(accessToken, siteUrl, { startDate, endDate, dimensions: ["page"], rowLimit: 10 }),
    gscQuery(accessToken, siteUrl, { startDate, endDate, dimensions: ["date"], rowLimit: 1000 }),
  ]);

  const t = totalsRes.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const mapRows = (r: { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] }) =>
    (r.rows ?? []).map((row) => ({
      key: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));

  return {
    totals: { clicks: t.clicks, impressions: t.impressions, ctr: t.ctr, position: t.position },
    topQueries: mapRows(queriesRes),
    topPages: mapRows(pagesRes),
    byDate: mapRows(dateRes).map((r) => ({ date: r.key, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
  };
}

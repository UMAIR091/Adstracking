// Microsoft Advertising (Bing Ads) backend. Auth is the Microsoft identity
// platform (OAuth2 with rotating refresh tokens) plus a developer token, like
// Google Ads. The API is SOAP-only: accounts come from the Customer Management
// service, and reporting is asynchronous — submit a report request, poll until
// it's ready, download a ZIP, and parse the CSV inside. Everything normalizes
// into the shared AdsReport shape (metrics.ts) rendered by AdsAnalytics.
//
// NOTE: SOAP element order is significant (DataContract serialization); this is
// built to the documented v13 contracts and verified against live credentials.
import JSZip from "jszip";
import type { IntegrationAccount, OAuthProvider, TokenSet } from "../types";
import { adsTotals, dayRange, isoDay, withRetry, type AdsDay, type AdsReport } from "../metrics";

const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPE = "https://ads.microsoft.com/msads.manage offline_access";
const CUSTOMER_MGMT = "https://clientcenter.api.bingads.microsoft.com/Api/CustomerManagement/v13/CustomerManagementService.svc";
const REPORTING = "https://reporting.api.bingads.microsoft.com/Api/Advertiser/Reporting/v13/ReportingService.svc";
const CM_NS = "https://bingads.microsoft.com/Customer/v13";
const CM_ENT_NS = "https://bingads.microsoft.com/Customer/v13/Entities";
const REP_NS = "https://bingads.microsoft.com/Reporting/v13";
const ARRAYS_NS = "http://schemas.microsoft.com/2003/10/Serialization/Arrays";

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function microsoftAdsConfigured(): boolean {
  return Boolean(
    process.env.MICROSOFT_ADS_CLIENT_ID && process.env.MICROSOFT_ADS_CLIENT_SECRET && process.env.MICROSOFT_ADS_DEVELOPER_TOKEN
  );
}

function redirectUri(): string {
  return `${env("NEXT_PUBLIC_APP_URL")}/api/microsoft/callback`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, scope: SCOPE }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Microsoft token request failed: ${data.error_description ?? data.error ?? res.status}`);
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in ?? 3600 };
}

export const microsoftAdsOAuth: OAuthProvider = {
  id: "microsoft",
  authUrl(state) {
    const params = new URLSearchParams({
      client_id: env("MICROSOFT_ADS_CLIENT_ID"),
      response_type: "code",
      redirect_uri: redirectUri(),
      scope: SCOPE,
      state,
    });
    return `${AUTH}/authorize?${params.toString()}`;
  },
  exchangeCode: (code) =>
    tokenRequest({
      grant_type: "authorization_code",
      code,
      client_id: env("MICROSOFT_ADS_CLIENT_ID"),
      client_secret: env("MICROSOFT_ADS_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
    }),
  refresh: (refreshToken) =>
    tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env("MICROSOFT_ADS_CLIENT_ID"),
      client_secret: env("MICROSOFT_ADS_CLIENT_SECRET"),
    }),
  async identity(accessToken) {
    try {
      const xml = await soapCall(CUSTOMER_MGMT, CM_NS, "GetUser", accessToken, "", `<GetUserRequest xmlns="${CM_NS}"><UserId i:nil="true"/></GetUserRequest>`);
      return tag(xml, "UserName") || tag(xml, "Name") || "Microsoft Ads account";
    } catch {
      return "Microsoft Ads account";
    }
  },
  callbackPath: "/api/microsoft/callback",
};

// ── SOAP plumbing ────────────────────────────────────────────

// Builds and sends a SOAP 1.1 envelope with the Bing Ads auth headers, returning
// the raw response XML. Header order follows the required contract.
async function soapCall(
  endpoint: string, ns: string, action: string, accessToken: string, extraHeaders: string, bodyXml: string
): Promise<string> {
  const envelope =
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">` +
    `<s:Header xmlns="${ns}">` +
    `<Action mustUnderstand="1">${action}</Action>` +
    `<DeveloperToken>${env("MICROSOFT_ADS_DEVELOPER_TOKEN")}</DeveloperToken>` +
    extraHeaders +
    `<AuthenticationToken>${accessToken}</AuthenticationToken>` +
    `</s:Header>` +
    `<s:Body>${bodyXml}</s:Body>` +
    `</s:Envelope>`;

  return withRetry(async () => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: action },
      body: envelope,
    });
    const text = await res.text();
    if (!res.ok || text.includes("<s:Fault") || text.includes("<faultstring")) {
      const msg = tag(text, "faultstring") || tag(text, "Message") || tag(text, "ErrorCode") || `${res.status}`;
      throw new Error(`Microsoft Ads API error: ${msg}`);
    }
    return text;
  });
}

// Minimal XML helpers (namespace-prefix agnostic) — we only read a few fields.
function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  return m ? m[1].trim() : undefined;
}
function tagAll(xml: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
function blocks(xml: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(?:\\w+:)?${name}[ >][\\s\\S]*?</(?:\\w+:)?${name}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[0]);
  return out;
}

// ── Account listing (Customer Management: GetUser → SearchAccounts) ──

// Lists the ad accounts the authenticated user can access. The account id is
// packed as "customerId:accountId" because reporting needs both in its headers.
export async function listMicrosoftAdsAccounts(accessToken: string): Promise<IntegrationAccount[]> {
  const userXml = await soapCall(CUSTOMER_MGMT, CM_NS, "GetUser", accessToken, "", `<GetUserRequest xmlns="${CM_NS}"><UserId i:nil="true"/></GetUserRequest>`);
  const userId = tag(userXml, "Id");
  if (!userId) throw new Error("Couldn't read the Microsoft Ads user.");

  const searchBody =
    `<SearchAccountsRequest xmlns="${CM_NS}" xmlns:a="${CM_ENT_NS}">` +
    `<Predicates><a:Predicate><a:Field>UserId</a:Field><a:Operator>Equals</a:Operator><a:Value>${userId}</a:Value></a:Predicate></Predicates>` +
    `<Ordering i:nil="true"/>` +
    `<PageInfo><a:Index>0</a:Index><a:Size>100</a:Size></PageInfo>` +
    `</SearchAccountsRequest>`;
  const xml = await soapCall(CUSTOMER_MGMT, CM_NS, "SearchAccounts", accessToken, "", searchBody);

  return blocks(xml, "AdvertiserAccount").map((b) => {
    const id = tag(b, "Id") ?? "";
    const parent = tag(b, "ParentCustomerId") ?? "";
    const name = tag(b, "Name") ?? id;
    return { id: `${parent}:${id}`, name: `${name} (${id})` };
  }).filter((a) => a.id.includes(":") && !a.id.startsWith(":"));
}

// ── Reporting (async: submit → poll → download ZIP → parse CSV) ──

const REPORT_COLUMNS = ["TimePeriod", "CurrencyCode", "Impressions", "Clicks", "Spend", "Conversions", "Revenue"];

function dateXml(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `<Day>${d}</Day><Month>${m}</Month><Year>${y}</Year>`;
}

function submitBody(accountId: string, since: string, until: string): string {
  const cols = REPORT_COLUMNS.map((c) => `<AccountPerformanceReportColumn>${c}</AccountPerformanceReportColumn>`).join("");
  return (
    `<SubmitGenerateReportRequest xmlns="${REP_NS}">` +
    `<ReportRequest i:type="AccountPerformanceReportRequest">` +
    `<ExcludeColumnHeaders>false</ExcludeColumnHeaders>` +
    `<ExcludeReportFooter>true</ExcludeReportFooter>` +
    `<ExcludeReportHeader>true</ExcludeReportHeader>` +
    `<Format>Csv</Format>` +
    `<ReportName>ReportFlow</ReportName>` +
    `<ReturnOnlyCompleteData>false</ReturnOnlyCompleteData>` +
    `<Aggregation>Daily</Aggregation>` +
    `<Columns>${cols}</Columns>` +
    `<Scope><AccountIds xmlns:a="${ARRAYS_NS}"><a:long>${accountId}</a:long></AccountIds></Scope>` +
    `<Time>` +
    `<CustomDateRangeEnd>${dateXml(until)}</CustomDateRangeEnd>` +
    `<CustomDateRangeStart>${dateXml(since)}</CustomDateRangeStart>` +
    `</Time>` +
    `</ReportRequest>` +
    `</SubmitGenerateReportRequest>`
  );
}

async function generateReportCsv(
  accessToken: string, customerId: string, accountId: string, since: string, until: string
): Promise<string> {
  const headers = `<CustomerId>${customerId}</CustomerId><CustomerAccountId>${accountId}</CustomerAccountId>`;
  const submitted = await soapCall(REPORTING, REP_NS, "SubmitGenerateReport", accessToken, headers, submitBody(accountId, since, until));
  const reportId = tag(submitted, "ReportRequestId");
  if (!reportId) throw new Error("Microsoft Ads did not return a report id.");

  // Poll until the report completes (bounded).
  let downloadUrl: string | undefined;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollBody = `<PollGenerateReportRequest xmlns="${REP_NS}"><ReportRequestId>${reportId}</ReportRequestId></PollGenerateReportRequest>`;
    const poll = await soapCall(REPORTING, REP_NS, "PollGenerateReport", accessToken, headers, pollBody);
    const status = tag(poll, "Status");
    if (status === "Success") {
      downloadUrl = tag(poll, "ReportDownloadUrl");
      break;
    }
    if (status === "Error") throw new Error("Microsoft Ads report generation failed.");
    // "Pending" → keep polling.
  }
  if (!downloadUrl) return ""; // no data / timed out — treated as an empty report

  const zipRes = await fetch(downloadUrl.replace(/&amp;/g, "&"));
  if (!zipRes.ok) throw new Error(`Microsoft Ads report download failed (${zipRes.status})`);
  const zip = await JSZip.loadAsync(await zipRes.arrayBuffer());
  const csvFile = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".csv"));
  return csvFile ? csvFile.async("string") : "";
}

// Parses the report CSV into daily rows keyed by column name.
function parseCsv(csv: string): Record<string, string>[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const split = (line: string) => line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
  const header = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

const num = (v: string | undefined) => {
  const n = Number((v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Fetches the normalized ads report for one account and period, plus the prior
// equal-length period for comparison. accountId = "customerId:accountId".
export async function fetchMicrosoftAdsReport(accessToken: string, packedId: string, periodDays: number): Promise<AdsReport> {
  const [customerId, accountId] = packedId.split(":");
  const since = isoDay(periodDays);
  const until = isoDay(1);

  const [csv, prevCsv] = await Promise.all([
    generateReportCsv(accessToken, customerId, accountId, since, until),
    generateReportCsv(accessToken, customerId, accountId, isoDay(periodDays * 2), isoDay(periodDays + 1)).catch(() => ""),
  ]);

  const rows = parseCsv(csv);
  const byDay = new Map<string, AdsDay>();
  for (const d of dayRange(periodDays)) byDay.set(d, { date: d, spend: 0, impressions: 0, clicks: 0, conversions: 0 });
  let revenue = 0;
  let currency = "USD";
  for (const r of rows) {
    const day = byDay.get((r.TimePeriod || "").slice(0, 10));
    if (r.CurrencyCode) currency = r.CurrencyCode;
    if (!day) continue;
    day.spend += num(r.Spend);
    day.impressions += num(r.Impressions);
    day.clicks += num(r.Clicks);
    day.conversions += num(r.Conversions);
    revenue += num(r.Revenue);
  }
  const byDate = Array.from(byDay.values());

  let previousTotals: AdsReport["previousTotals"] = null;
  const prevRows = parseCsv(prevCsv);
  if (prevRows.length) {
    const prevDay: AdsDay = { date: since, spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    let prevRevenue = 0;
    for (const r of prevRows) {
      prevDay.spend += num(r.Spend);
      prevDay.impressions += num(r.Impressions);
      prevDay.clicks += num(r.Clicks);
      prevDay.conversions += num(r.Conversions);
      prevRevenue += num(r.Revenue);
    }
    previousTotals = adsTotals([prevDay], prevRevenue);
  }

  return {
    platform: "microsoft_ads",
    currency,
    totals: adsTotals(byDate, revenue),
    previousTotals,
    byDate,
    topCampaigns: [], // account-level report; campaign breakdown omitted to keep one report call.
  };
}

// Moz backend. Uses the official Moz Links API v2, authenticated with an Access
// ID + Secret Key via HTTP Basic Auth (Access ID = username, Secret Key =
// password). Both secrets are stored together as the Basic userinfo string
// ("<accessId>:<secretKey>") in the encrypted access_token column and never
// leave the server. The "account" is the target domain, collected alongside the
// credentials on the consent screen.
//
// The Moz Links API reports link-graph metrics (Domain Authority, backlinks,
// referring domains) but NOT organic traffic or organic keywords — those belong
// to Moz Pro/STAT, a separate product with no public API here. Per the "only
// fetch data supported by each provider" rule, those SeoTotals fields stay 0
// rather than being fabricated. Everything normalizes into the shared SeoReport
// shape (metrics.ts) rendered by SeoAnalytics.
import type { IntegrationAccount } from "../types";
import { withRetry, type SeoReport, type SeoTotals } from "../metrics";

const BASE = "https://lsapi.seomoz.com/v2";

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

// Access ID + Secret Key joined as the HTTP Basic userinfo. Access IDs
// ("mozscape-xxxx") and hex secret keys never contain a colon, so a single
// split on the first ":" is unambiguous. This is what we persist (encrypted).
function toBasicUserinfo(accessId: string, secretKey: string): string {
  return `${accessId}:${secretKey}`;
}

// Turns a validation/API failure into a provider-specific, secret-free message.
function mozErrorMessage(status: number, body: unknown): string {
  const detail = (body as { message?: string; error?: string })?.message
    ?? (body as { error?: string })?.error;
  if (status === 401) return "Moz rejected these credentials. Check the Access ID and Secret Key from Moz → API → Links API.";
  if (status === 403) return "These Moz credentials are valid but not authorized for the Links API (check your Moz API plan/quota).";
  if (status === 404) return "Moz couldn't find data for that domain. Double-check the domain.";
  if (status === 429) return "Moz rate limit reached. Please try again in a moment.";
  return `Moz API error (${status})${detail ? `: ${detail}` : ""}`;
}

async function mozPost<T>(basic: string, path: string, payload: unknown): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        // btoa isn't available in all Node runtimes; Buffer is (runtime = nodejs).
        Authorization: `Basic ${Buffer.from(basic).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) throw new Error("Moz rate limit (429)");
    if (!res.ok) throw new Error(mozErrorMessage(res.status, data));
    return data as T;
  });
}

// Moz Links API v2 url_metrics result (subset we consume). Field names per
// https://moz.com/help/links-api/making-calls/url-metrics.
type UrlMetrics = {
  results?: Array<{
    domain_authority?: number;
    page_authority?: number;
    spam_score?: number;
    // Backlinks: total pages linking to the target's root domain.
    pages_to_root_domain?: number;
    external_pages_to_root_domain?: number;
    // Referring domains: distinct root domains linking to the target's root domain.
    root_domains_to_root_domain?: number;
  }>;
};

const numOr0 = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// Verifies the Access ID + Secret Key + domain by pulling url_metrics (the
// lightest Links API call). Throws a provider-specific error on failure so no
// invalid credential is ever saved. Returns the domain as the sole account and
// the Basic userinfo string as the token to encrypt.
export async function verifyMozKey(fields: Record<string, string>): Promise<{ displayName: string; token: string; accounts: IntegrationAccount[] }> {
  const accessId = (fields.accessId ?? "").trim();
  const secretKey = (fields.secretKey ?? "").trim();
  const domain = normalizeDomain(fields.domain ?? "");
  if (!accessId) throw new Error("A Moz Access ID is required.");
  if (!secretKey) throw new Error("A Moz Secret Key is required.");
  if (!domain) throw new Error("A domain to analyze is required.");

  const basic = toBasicUserinfo(accessId, secretKey);
  // Throws (with a provider-specific message) if the credentials or domain are invalid.
  await mozPost<UrlMetrics>(basic, "/url_metrics", { targets: [domain] });

  return { displayName: domain, token: basic, accounts: [{ id: domain, name: domain }] };
}

// Fetches the normalized SEO report for the domain. `token` is the stored Basic
// userinfo ("<accessId>:<secretKey>"); accountId = the domain. periodDays is
// ignored — Moz Links metrics are point-in-time, not a time series.
export async function fetchMozReport(token: string, domain: string, _periodDays: number): Promise<SeoReport> {
  const metrics = await mozPost<UrlMetrics>(token, "/url_metrics", { targets: [domain] });
  const m = metrics.results?.[0] ?? {};
  const totals: SeoTotals = {
    // Moz Links API has no organic traffic/keyword data — left at 0 (see file header).
    organicKeywords: 0,
    organicTraffic: 0,
    backlinks: numOr0(m.external_pages_to_root_domain ?? m.pages_to_root_domain),
    referringDomains: numOr0(m.root_domains_to_root_domain),
    domainRating: numOr0(m.domain_authority),
  };

  return {
    platform: "moz",
    target: domain,
    totals,
    previousTotals: null,
    // Moz doesn't expose per-keyword organic data via the Links API.
    topKeywords: [],
  };
}

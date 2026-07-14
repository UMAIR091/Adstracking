// Ahrefs backend. Uses an API key (Bearer token) via the generic api-key flow.
// The "account" is the domain being analyzed, collected alongside the key on the
// consent screen. Point-in-time SEO metrics are normalized into the shared
// SeoReport shape (metrics.ts) rendered by SeoAnalytics.
import type { IntegrationAccount } from "../types";
import { withRetry, type SeoReport, type SeoTotals } from "../metrics";

const BASE = "https://api.ahrefs.com/v3";
const DEFAULT_COUNTRY = "us";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ahrefsGet<T>(apiKey: string, path: string): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (res.status === 429) throw new Error("Ahrefs rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { error?: string }).error ?? res.statusText;
      throw new Error(`Ahrefs API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

// Verifies the key + domain by pulling domain rating, and returns the domain as
// the sole account.
export async function verifyAhrefsKey(fields: Record<string, string>): Promise<{ displayName: string; token: string; accounts: IntegrationAccount[] }> {
  const apiKey = fields.apiKey;
  const domain = normalizeDomain(fields.domain ?? "");
  if (!apiKey) throw new Error("An Ahrefs API key is required.");
  if (!domain) throw new Error("A domain to analyze is required.");
  // Throws if the key or domain is invalid.
  await ahrefsGet(apiKey, `/site-explorer/domain-rating?target=${encodeURIComponent(domain)}&date=${today()}`);
  return { displayName: domain, token: apiKey, accounts: [{ id: domain, name: domain }] };
}

type DomainRating = { domain_rating?: { domain_rating?: number } };
type BacklinksStats = { metrics?: { live?: number; live_refdomains?: number } };
type SiteMetrics = { metrics?: { org_keywords?: number; org_traffic?: number } };
type OrganicKeyword = { keyword?: string; best_position?: number; volume?: number; traffic?: number };

// Fetches the normalized SEO report for the domain. accountId = the domain.
export async function fetchAhrefsReport(apiKey: string, domain: string, _periodDays: number): Promise<SeoReport> {
  const t = encodeURIComponent(domain);
  const date = today();
  const [dr, links, metrics, keywords] = await Promise.all([
    ahrefsGet<DomainRating>(apiKey, `/site-explorer/domain-rating?target=${t}&date=${date}`).catch(() => ({} as DomainRating)),
    ahrefsGet<BacklinksStats>(apiKey, `/site-explorer/backlinks-stats?target=${t}&mode=domain&date=${date}`).catch(() => ({} as BacklinksStats)),
    ahrefsGet<SiteMetrics>(apiKey, `/site-explorer/metrics?target=${t}&date=${date}&country=${DEFAULT_COUNTRY}`).catch(() => ({} as SiteMetrics)),
    ahrefsGet<{ keywords?: OrganicKeyword[] }>(
      apiKey,
      `/site-explorer/organic-keywords?target=${t}&date=${date}&country=${DEFAULT_COUNTRY}` +
      `&select=${encodeURIComponent("keyword,best_position,volume,traffic")}&order_by=traffic%3Adesc&limit=10`
    ).catch(() => ({ keywords: [] as OrganicKeyword[] })),
  ]);

  const totals: SeoTotals = {
    organicKeywords: metrics.metrics?.org_keywords ?? 0,
    organicTraffic: metrics.metrics?.org_traffic ?? 0,
    backlinks: links.metrics?.live ?? 0,
    referringDomains: links.metrics?.live_refdomains ?? 0,
    domainRating: dr.domain_rating?.domain_rating ?? 0,
  };

  return {
    platform: "ahrefs",
    target: domain,
    totals,
    previousTotals: null, // historical snapshots cost extra Ahrefs credits; omitted.
    topKeywords: (keywords.keywords ?? []).map((k) => ({
      keyword: k.keyword ?? "—",
      position: k.best_position ?? 0,
      volume: k.volume ?? 0,
      traffic: k.traffic ?? 0,
    })),
  };
}

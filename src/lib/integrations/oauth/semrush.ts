// Semrush backend. Uses an API key (passed as a query param) via the generic
// api-key flow; the "account" is the analyzed domain. Semrush returns semicolon-
// separated CSV (and "ERROR ##" strings on failure). Metrics normalize into the
// shared SeoReport shape (metrics.ts) rendered by SeoAnalytics.
import type { IntegrationAccount } from "../types";
import { withRetry, type SeoReport, type SeoTotals } from "../metrics";

const BASE = "https://api.semrush.com";
const DATABASE = "us";

function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

// Semrush returns CSV rows separated by ";" — parse to objects keyed by header.
function parseSemrush(text: string): Record<string, string>[] {
  if (text.startsWith("ERROR")) throw new Error(`Semrush API error: ${text.trim()}`);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(";");
  return lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h.trim()] = (cells[i] ?? "").trim()));
    return row;
  });
}

async function semrushGet(path: string): Promise<Record<string, string>[]> {
  return withRetry(async () => {
    const res = await fetch(`${BASE}${path}`);
    const text = await res.text();
    if (res.status === 429) throw new Error("Semrush rate limit (429)");
    if (!res.ok) throw new Error(`Semrush API error: ${res.status}`);
    return parseSemrush(text);
  });
}

const num = (v: string | undefined) => {
  const n = Number((v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Verifies the key + domain via a domain_ranks lookup; returns the domain as the
// sole account.
export async function verifySemrushKey(fields: Record<string, string>): Promise<{ displayName: string; token: string; accounts: IntegrationAccount[] }> {
  const apiKey = fields.apiKey;
  const domain = normalizeDomain(fields.domain ?? "");
  if (!apiKey) throw new Error("A Semrush API key is required.");
  if (!domain) throw new Error("A domain to analyze is required.");
  await semrushGet(`/?type=domain_ranks&key=${encodeURIComponent(apiKey)}&domain=${encodeURIComponent(domain)}&database=${DATABASE}&export_columns=Db,Dn,Or,Ot`);
  return { displayName: domain, token: apiKey, accounts: [{ id: domain, name: domain }] };
}

// Fetches the normalized SEO report for the domain. accountId = the domain.
export async function fetchSemrushReport(apiKey: string, domain: string, _periodDays: number): Promise<SeoReport> {
  const k = encodeURIComponent(apiKey);
  const d = encodeURIComponent(domain);

  const [ranks, organic, backlinks] = await Promise.all([
    semrushGet(`/?type=domain_ranks&key=${k}&domain=${d}&database=${DATABASE}&export_columns=Or,Ot`).catch(() => [] as Record<string, string>[]),
    semrushGet(`/?type=domain_organic&key=${k}&domain=${d}&database=${DATABASE}&display_limit=10&export_columns=Ph,Po,Nq,Tr`).catch(() => [] as Record<string, string>[]),
    semrushGet(`/analytics/v1/?key=${k}&type=backlinks_overview&target=${d}&target_type=root_domain&export_columns=ascore,total,domains_num`).catch(() => [] as Record<string, string>[]),
  ]);

  const r = ranks[0] ?? {};
  const b = backlinks[0] ?? {};
  const organicTraffic = num(r.Ot);
  const totals: SeoTotals = {
    organicKeywords: num(r.Or),
    organicTraffic,
    backlinks: num(b.total),
    referringDomains: num(b.domains_num),
    domainRating: num(b.ascore),
  };

  return {
    platform: "semrush",
    target: domain,
    totals,
    previousTotals: null, // historical data costs extra Semrush API units; omitted.
    topKeywords: organic.map((row) => ({
      keyword: row.Ph ?? "—",
      position: num(row.Po),
      volume: num(row.Nq),
      // Tr is a traffic share (0..1) of the domain's organic traffic.
      traffic: Math.round(num(row.Tr) * organicTraffic),
    })),
  };
}

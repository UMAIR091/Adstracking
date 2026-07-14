// CallRail backend. Uses an API key (CallRail's official auth) via the generic
// api-key flow. A key can span several CallRail accounts, so verify lists them
// for selection; a connection maps to one account. Call activity is normalized
// into the shared CallReport shape (metrics.ts) rendered by CallAnalytics.
import type { IntegrationAccount } from "../types";
import { dayRange, isoDay, ratio, withRetry, type CallDay, type CallReport, type CallTotals } from "../metrics";

const BASE = "https://api.callrail.com/v3";

function headers(apiKey: string): Record<string, string> {
  return { Authorization: `Token token="${apiKey}"`, Accept: "application/json" };
}

async function crGet<T>(apiKey: string, path: string): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${BASE}${path}`, { headers: headers(apiKey) });
    if (res.status === 429) throw new Error("CallRail rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { error?: string }).error ?? res.statusText;
      throw new Error(`CallRail API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

// Verifies the key and returns the CallRail accounts it can access.
export async function verifyCallRailKey(fields: Record<string, string>): Promise<{ displayName: string; token: string; accounts: IntegrationAccount[] }> {
  const apiKey = fields.apiKey;
  if (!apiKey) throw new Error("A CallRail API key is required.");
  const data = await crGet<{ accounts?: { id: string; name?: string }[] }>(apiKey, "/a.json");
  const accounts = (data.accounts ?? []).map((a) => ({ id: String(a.id), name: a.name ?? String(a.id) }));
  if (!accounts.length) throw new Error("No CallRail accounts found for this key.");
  return { displayName: accounts[0].name, token: apiKey, accounts };
}

type Call = {
  start_time?: string;
  first_call?: boolean;
  answered?: boolean;
  duration?: number;
  source_name?: string;
};

async function listCalls(apiKey: string, accountId: string, start: string, end: string): Promise<Call[]> {
  const out: Call[] = [];
  // Cap pagination so a high-volume account can't stall the sync.
  for (let page = 1; page <= 20; page++) {
    const q =
      `/a/${accountId}/calls.json?start_date=${start}&end_date=${end}` +
      `&fields=start_time,first_call,answered,duration,source_name&per_page=250&page=${page}`;
    const data = await crGet<{ calls?: Call[]; total_pages?: number }>(apiKey, q);
    out.push(...(data.calls ?? []));
    if (page >= (data.total_pages ?? 1)) break;
  }
  return out;
}

function totalsFrom(calls: Call[]): CallTotals {
  const leads = calls.filter((c) => c.first_call).length;
  const answered = calls.filter((c) => c.answered).length;
  const duration = calls.reduce((s, c) => s + (c.duration ?? 0), 0);
  return {
    calls: calls.length,
    leads,
    answered,
    missed: calls.length - answered,
    avgDurationSec: Math.round(ratio(duration, calls.length)),
  };
}

// Fetches the normalized call report for one account and period, plus the prior
// equal-length period for comparison. accountId = the CallRail account id.
export async function fetchCallRailReport(apiKey: string, accountId: string, periodDays: number): Promise<CallReport> {
  const since = isoDay(periodDays);
  const until = isoDay(1);

  const [calls, prevCalls] = await Promise.all([
    listCalls(apiKey, accountId, since, until),
    listCalls(apiKey, accountId, isoDay(periodDays * 2), isoDay(periodDays + 1)).catch(() => [] as Call[]),
  ]);

  const byDay = new Map<string, CallDay>();
  for (const d of dayRange(periodDays)) byDay.set(d, { date: d, calls: 0, leads: 0 });
  const sources = new Map<string, number>();
  for (const c of calls) {
    const day = byDay.get((c.start_time ?? "").slice(0, 10));
    if (day) {
      day.calls += 1;
      if (c.first_call) day.leads += 1;
    }
    const src = c.source_name || "Unknown";
    sources.set(src, (sources.get(src) ?? 0) + 1);
  }

  return {
    platform: "callrail",
    totals: totalsFrom(calls),
    previousTotals: prevCalls.length ? totalsFrom(prevCalls) : null,
    byDate: Array.from(byDay.values()),
    topSources: Array.from(sources.entries())
      .map(([name, count]) => ({ name, calls: count }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 8),
  };
}

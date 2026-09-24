// Snapchat connector against a fake Marketing API.
//
// Pins the three things that made every Snapchat sync fail with an unreadable
// error: the 31-day cap on synchronous DAY-granularity stats (a 90-day report
// has to be fetched in windows), day boundaries that must be midnight in the AD
// ACCOUNT's timezone rather than UTC, and Snapchat's error body, which carries
// debug_message/error_code — not the OAuth-style error_description.
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchSnapchatAdsReport } from "./snapchat";

const DAY_MS = 24 * 60 * 60 * 1000;
const AD_ACCOUNT = "ce943c3b-2404-4fff-acb1-259b7b052f27";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let calls: string[];

// route(url) returns the Response for one request.
function fakeApi(route: (url: URL) => Response) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(String(url));
    return route(new URL(String(url)));
  }));
}

// A fake account in `timezone`, empty stats everywhere — this suite is about
// the requests we send, not the numbers we get back.
function emptyApi(timezone: string) {
  fakeApi((url) => {
    if (url.pathname.endsWith("/campaigns")) return json(200, { campaigns: [] });
    if (url.pathname.endsWith("/stats")) {
      return url.searchParams.get("granularity") === "DAY"
        ? json(200, { timeseries_stats: [{ timeseries_stat: { timeseries: [] } }] })
        : json(200, { total_stats: [{ total_stat: { breakdown_stats: { campaign: [] } } }] });
    }
    return json(200, { adaccounts: [{ adaccount: { id: AD_ACCOUNT, name: "Test", timezone, currency: "USD" } }] });
  });
}

// Every DAY-granularity stats window we asked for, oldest first.
function dayWindows(): { start: string; end: string; days: number }[] {
  return calls
    .map((c) => new URL(c))
    .filter((u) => u.pathname.endsWith("/stats") && u.searchParams.get("granularity") === "DAY")
    .map((u) => {
      const start = u.searchParams.get("start_time") ?? "";
      const end = u.searchParams.get("end_time") ?? "";
      return { start, end, days: Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) };
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

afterEach(() => vi.unstubAllGlobals());

describe("Snapchat daily stats", () => {
  it("splits a 90-day report into windows Snapchat will accept", async () => {
    emptyApi("UTC");
    await fetchSnapchatAdsReport("token", AD_ACCOUNT, 90);

    const windows = dayWindows();
    expect(windows.length).toBeGreaterThan(1);
    // The cap that produced the 400: no single request may exceed 31 days.
    for (const w of windows) expect(w.days).toBeLessThanOrEqual(31);

    // The windows still tile the reported period and its comparison period
    // (180 days back) with no gaps and no overlaps.
    for (let i = 1; i < windows.length; i++) expect(windows[i].start).toBe(windows[i - 1].end);
    expect(Math.round((Date.parse(windows.at(-1)!.end) - Date.parse(windows[0].start)) / DAY_MS)).toBe(180);
  });

  it("keeps a 28-day report in a single request", async () => {
    emptyApi("UTC");
    await fetchSnapchatAdsReport("token", AD_ACCOUNT, 28);

    const current = dayWindows().filter((w) => w.days === 28);
    expect(current).toHaveLength(2); // the period and its comparison period
  });

  it("asks for day boundaries in the ad account's timezone, not UTC", async () => {
    emptyApi("Asia/Karachi"); // +05:00 year-round
    await fetchSnapchatAdsReport("token", AD_ACCOUNT, 90);

    for (const w of dayWindows()) {
      expect(w.start).toMatch(/T00:00:00\.000\+05:00$/);
      expect(w.end).toMatch(/T00:00:00\.000\+05:00$/);
    }
  });
});

describe("Snapchat ad account metrics", () => {
  it("asks for the campaign breakdown, which is the only way an ad account serves more than spend", async () => {
    emptyApi("UTC");
    await fetchSnapchatAdsReport("token", AD_ACCOUNT, 28);

    const day = calls.map((c) => new URL(c)).find((u) => u.searchParams.get("granularity") === "DAY")!;
    expect(day.searchParams.get("breakdown")).toBe("campaign");
    expect(day.searchParams.get("fields")).toContain("impressions");
  });

  it("adds the campaigns back up into one account total per day", async () => {
    const dayStats = (start: string, spend: number, impressions: number) => ({
      start_time: start, stats: { spend, impressions, swipes: 1, conversion_purchases: 0 },
    });
    fakeApi((url) => {
      if (url.pathname.endsWith("/campaigns")) return json(200, { campaigns: [] });
      if (url.pathname.endsWith("/stats") && url.searchParams.get("granularity") === "DAY") {
        const start = url.searchParams.get("start_time")!;
        return json(200, {
          timeseries_stats: [{
            timeseries_stat: {
              breakdown_stats: {
                campaign: [
                  { id: "c1", timeseries: [dayStats(start, 2_000_000, 10)] },
                  { id: "c2", timeseries: [dayStats(start, 3_000_000, 5)] },
                ],
              },
            },
          }],
        });
      }
      if (url.pathname.endsWith("/stats")) return json(200, { total_stats: [] });
      return json(200, { adaccounts: [{ adaccount: { id: AD_ACCOUNT, timezone: "UTC", currency: "USD" } }] });
    });

    const report = await fetchSnapchatAdsReport("token", AD_ACCOUNT, 28);
    const day = report.byDate.find((d) => d.spend > 0)!;
    expect(day.spend).toBe(5); // 2 + 3, converted out of micro-currency
    expect(day.impressions).toBe(15);
    expect(day.clicks).toBe(2);
  });

  it("falls back to spend alone rather than failing when the breakdown is refused", async () => {
    fakeApi((url) => {
      if (url.pathname.endsWith("/campaigns")) return json(200, { campaigns: [] });
      if (url.pathname.endsWith("/stats") && url.searchParams.get("granularity") === "DAY") {
        if (url.searchParams.get("breakdown")) {
          return json(400, {
            request_status: "ERROR",
            debug_message: "Unsupported Stats Query: Only field 'spend' should be used when querying AdAccount stats.",
            error_code: "E1008",
          });
        }
        return json(200, {
          timeseries_stats: [{
            timeseries_stat: {
              timeseries: [{ start_time: url.searchParams.get("start_time")!, stats: { spend: 4_000_000 } }],
            },
          }],
        });
      }
      if (url.pathname.endsWith("/stats")) return json(200, { total_stats: [] });
      return json(200, { adaccounts: [{ adaccount: { id: AD_ACCOUNT, timezone: "UTC", currency: "USD" } }] });
    });

    const report = await fetchSnapchatAdsReport("token", AD_ACCOUNT, 28);
    expect(report.byDate.some((d) => d.spend === 4)).toBe(true);
    const retry = calls.map((c) => new URL(c)).find((u) => u.searchParams.get("granularity") === "DAY" && !u.searchParams.get("breakdown"))!;
    expect(retry.searchParams.get("fields")).toBe("spend");
  });
});

describe("Snapchat errors", () => {
  it("surfaces Snapchat's own message and code instead of a bare 400", async () => {
    fakeApi((url) => {
      if (url.pathname.endsWith("/stats")) {
        return json(400, {
          request_status: "ERROR",
          debug_message: "start_time and end_time must be within 31 days",
          display_message: "We're sorry, but the data you requested is currently unavailable",
          error_code: "E3002",
        });
      }
      return json(200, { adaccounts: [{ adaccount: { id: AD_ACCOUNT, timezone: "UTC", currency: "USD" } }] });
    });

    await expect(fetchSnapchatAdsReport("token", AD_ACCOUNT, 90)).rejects.toThrow(
      "Snapchat API error: start_time and end_time must be within 31 days [E3002] (400)"
    );
  });
});

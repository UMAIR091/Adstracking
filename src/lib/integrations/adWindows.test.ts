import { afterEach, describe, expect, it, vi } from "vitest";
import { adWindows, lastCompleteDay, localToday } from "./metrics";
import { fetchGoogleAdsReport } from "./oauth/googleAds";
import { fetchRedditAdsReport } from "./oauth/reddit";
import { fetchSnapchatAdsReport } from "./oauth/snapchat";
import { ga4Windows } from "@/lib/google";

// Ad platforms bucket daily figures by the AD ACCOUNT's calendar. A window
// that ends on "yesterday in UTC" ends, at the 06:00 UTC sync, on a day still
// running in the Americas — the newest day of a US account came in short.
// These pin that every window ends on the account's last COMPLETE day.

const SYNC = Date.parse("2026-10-12T06:00:00Z"); // 23:00 on 11 Oct in Los Angeles, 11:00 on 12 Oct in Karachi

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("lastCompleteDay", () => {
  it("is the day before the account's local today", () => {
    expect(localToday("America/Los_Angeles", SYNC)).toBe("2026-10-11");
    expect(lastCompleteDay("America/Los_Angeles", SYNC)).toBe("2026-10-10");
    expect(lastCompleteDay("Asia/Karachi", SYNC)).toBe("2026-10-11");
    expect(lastCompleteDay("UTC", SYNC)).toBe("2026-10-11");
  });

  it("with no known zone, is the newest day that has ended everywhere", () => {
    expect(lastCompleteDay(null, SYNC)).toBe("2026-10-10");
    expect(lastCompleteDay("Not/AZone", SYNC)).toBe("2026-10-10");
    // 11 Oct ends at UTC−12 at 12:00 UTC on 12 Oct.
    expect(lastCompleteDay(null, Date.parse("2026-10-12T11:59:00Z"))).toBe("2026-10-10");
    expect(lastCompleteDay(null, Date.parse("2026-10-12T12:00:00Z"))).toBe("2026-10-11");
  });
});

describe("adWindows", () => {
  it("is periodDays long, contiguous with an equal previous window", () => {
    const w = adWindows(28, "Asia/Karachi", SYNC);
    expect(w).toMatchObject({ since: "2026-09-14", until: "2026-10-11", prevSince: "2026-08-17", prevUntil: "2026-09-13", timeZone: "Asia/Karachi" });
    expect(w.days).toHaveLength(28);
    expect(w.days[0]).toBe("2026-09-14");
    expect(w.days[27]).toBe("2026-10-11");
  });

  it("records no zone when the zone isn't one the runtime knows", () => {
    expect(adWindows(7, "Not/AZone", SYNC).timeZone).toBeNull();
  });

  it("stays the right length across a daylight-saving change", () => {
    // US clocks go back on 1 Nov 2026.
    const w = adWindows(7, "America/Los_Angeles", Date.parse("2026-11-03T06:00:00Z"));
    expect(w.until).toBe("2026-11-01");
    expect(w.days).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
});

describe("GA4 windows follow the property's time zone", () => {
  it("ends on the property's last complete day", () => {
    expect(ga4Windows(28, "America/Los_Angeles", SYNC)).toEqual({ start: "2026-09-13", end: "2026-10-10", prevStart: "2026-08-16", prevEnd: "2026-09-12" });
    expect(ga4Windows(28, "Asia/Karachi", SYNC).end).toBe("2026-10-11");
  });
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("Google Ads", () => {
  it("queries the account's own last 28 complete days and records them", async () => {
    vi.useFakeTimers({ now: SYNC, toFake: ["Date"] });
    const queries: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const { query } = JSON.parse(String(init.body)) as { query: string };
      queries.push(query);
      if (query.includes("customer.time_zone")) return json({ results: [{ customer: { currencyCode: "USD", timeZone: "America/Los_Angeles" } }] });
      return json({ results: [] });
    }));

    const r = await fetchGoogleAdsReport("tok", "1234567890", 28);
    expect(queries.find((q) => q.includes("segments.date, metrics"))).toContain("BETWEEN '2026-09-13' AND '2026-10-10'");
    expect(r.byDate).toHaveLength(28);
    expect(r.byDate[27].date).toBe("2026-10-10");
    expect(r.window).toEqual({ start: "2026-09-13", end: "2026-10-10" });
    expect(r.timeZone).toBe("America/Los_Angeles");
  });

  it("ends on a day complete everywhere when the account's zone can't be read", async () => {
    vi.useFakeTimers({ now: SYNC, toFake: ["Date"] });
    vi.stubGlobal("fetch", vi.fn(async () => json({ results: [] })));
    const r = await fetchGoogleAdsReport("tok", "1234567890", 28);
    expect(r.window).toEqual({ start: "2026-09-13", end: "2026-10-10" });
    expect(r.timeZone).toBeNull();
  });
});

describe("Reddit", () => {
  it("asks for whole UTC days, not 'this hour N days ago' to 'this hour now'", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-12T06:37:00Z"), toFake: ["Date"] });
    const bodies: { starts_at: string; ends_at: string; breakdowns: string[] }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.body) bodies.push((JSON.parse(String(init.body)) as { data: (typeof bodies)[number] }).data);
      return json({ data: { metrics: [] } });
    }));
    const r = await fetchRedditAdsReport("tok", "a1", 28);
    const daily = bodies.filter((b) => b.breakdowns[0] === "DATE");
    expect(daily.map((b) => [b.starts_at, b.ends_at])).toEqual([
      ["2026-09-14T00:00:00Z", "2026-10-12T00:00:00Z"],
      ["2026-08-17T00:00:00Z", "2026-09-14T00:00:00Z"],
    ]);
    expect(r.byDate.map((d) => d.date)).toEqual(adWindows(28, "UTC", Date.parse("2026-10-12T06:37:00Z")).days);
  });
});

describe("Snapchat", () => {
  it("keys its days by the account's calendar, matching what it requested", async () => {
    vi.useFakeTimers({ now: SYNC, toFake: ["Date"] });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/campaigns")) return json({ campaigns: [] });
      if (u.pathname.endsWith("/stats")) {
        return u.searchParams.get("granularity") === "DAY"
          ? json({ timeseries_stats: [{ timeseries_stat: { timeseries: [] } }] })
          : json({ total_stats: [{ total_stat: { breakdown_stats: { campaign: [] } } }] });
      }
      return json({ adaccounts: [{ adaccount: { id: "x", timezone: "America/Los_Angeles", currency: "USD" } }] });
    }));
    const r = await fetchSnapchatAdsReport("tok", "x", 28);
    // In Los Angeles it is still 11 Oct: the newest complete day is 10 Oct.
    expect(r.byDate[r.byDate.length - 1].date).toBe("2026-10-10");
    expect(r.byDate).toHaveLength(28);
    expect(r.window).toEqual({ start: "2026-09-13", end: "2026-10-10" });
  });
});

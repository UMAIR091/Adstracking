import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMetaAdsReport, insights } from "./meta";

// The insights edge returns 25 rows a page unless told otherwise, and only the
// first page used to be read: a 28- or 90-day daily breakdown stopped after
// 25 days. These pin cursor-following and the spend ranking of campaigns.

const fetchMock = vi.fn();
beforeEach(() => {
  process.env.META_APP_SECRET = "test-secret";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const page = (rows: unknown[], after?: string) =>
  new Response(JSON.stringify({ data: rows, ...(after ? { paging: { cursors: { after }, next: `https://graph.facebook.com/next?after=${after}` } } : {}) }), { status: 200 });
const urlOf = (i: number) => new URL(String(fetchMock.mock.calls[i][0]));

describe("insights paging", () => {
  it("follows the cursor to the last page", async () => {
    fetchMock
      .mockResolvedValueOnce(page([{ date_start: "2026-09-01" }, { date_start: "2026-09-02" }], "c1"))
      .mockResolvedValueOnce(page([{ date_start: "2026-09-03" }], "c2"))
      .mockResolvedValueOnce(page([{ date_start: "2026-09-04" }]));
    const rows = await insights("tok", "act_1", { time_increment: "1" });
    expect(rows.map((r) => r.date_start)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(urlOf(0).searchParams.get("after")).toBeNull();
    expect(urlOf(1).searchParams.get("after")).toBe("c1");
    expect(urlOf(2).searchParams.get("after")).toBe("c2");
  });

  it("stops on a page without a next link even if a cursor is present", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ date_start: "2026-09-01" }], paging: { cursors: { after: "x" } } }), { status: 200 })
    );
    expect(await insights("tok", "act_1", {})).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces an API error instead of returning a partial series", async () => {
    fetchMock
      .mockResolvedValueOnce(page([{ date_start: "2026-09-01" }], "c1"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 400 }));
    await expect(insights("tok", "act_1", {})).rejects.toThrow(/rate limited/);
  });
});

describe("fetchMetaAdsReport", () => {
  it("returns every day of the window and ranks campaigns by spend", async () => {
    fetchMock.mockImplementation(async (input: string) => {
      const u = new URL(input);
      if (u.pathname.endsWith("/act_1")) return new Response(JSON.stringify({ currency: "GBP" }), { status: 200 });
      if (u.searchParams.get("time_increment") === "1") {
        // 28 days over two pages.
        const days = Array.from({ length: 28 }, (_, i) => ({ date_start: `2026-09-${String(i + 1).padStart(2, "0")}`, spend: "1", impressions: "10", clicks: "1" }));
        return u.searchParams.get("after") ? page(days.slice(25)) : page(days.slice(0, 25), "p2");
      }
      if (u.searchParams.get("level") === "campaign") {
        return page(Array.from({ length: 12 }, (_, i) => ({ campaign_name: `C${i}`, spend: String(i), impressions: "1", clicks: "1", ctr: "1" })));
      }
      return page([{ spend: "28", impressions: "280", clicks: "28", ctr: "10", cpc: "1" }]);
    });

    const r = await fetchMetaAdsReport("tok", "act_1", 28);
    expect(r.byDate).toHaveLength(28);
    expect(r.topCampaigns.map((c) => c.name)).toEqual(["C11", "C10", "C9", "C8", "C7", "C6", "C5", "C4", "C3", "C2"]);
  });
});

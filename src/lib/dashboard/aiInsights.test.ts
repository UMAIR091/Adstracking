import { describe, expect, it } from "vitest";
import { latestInsightsPerClient, siteLabel, type InsightReportRow } from "./aiInsights";
import { forClient, type Signal } from "@/lib/insights/signals";

const row = (over: Partial<InsightReportRow>): InsightReportRow => ({
  id: "r",
  title: "Report",
  client_id: "a",
  created_at: "2026-10-01T08:00:00Z",
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  summary: "Clicks rose 12%.",
  actions: ["Refresh the pricing page."],
  issues: [],
  source_ids: ["gsc", "ga4"],
  clients: { name: "Acme", archived: false },
  ...over,
});

describe("latestInsightsPerClient", () => {
  it("takes each client's newest report that has AI insights, and only that one", () => {
    const out = latestInsightsPerClient([
      row({ id: "a2", client_id: "a", summary: null }), // newest, but no AI (e.g. Free plan)
      row({ id: "b1", client_id: "b", clients: { name: "Bloom" }, summary: "Bloom grew.", actions: [] }),
      row({ id: "a1", client_id: "a" }),
      row({ id: "a0", client_id: "a", summary: "Older Acme text." }),
    ]);
    expect(out.map((o) => [o.clientId, o.reportId])).toEqual([["b", "b1"], ["a", "a1"]]);
  });

  it("never mixes clients: every field comes from that client's own report", () => {
    const [bloom, acme] = latestInsightsPerClient([
      row({ id: "b1", client_id: "b", clients: [{ name: "Bloom" }], summary: "Bloom grew.", actions: null, source_ids: ["meta_ads"] }),
      row({ id: "a1", client_id: "a" }),
    ]);
    expect(bloom).toMatchObject({ clientName: "Bloom", summary: "Bloom grew.", reportId: "b1", nextStep: null });
    expect(bloom.platforms).toHaveLength(1);
    expect(acme).toMatchObject({ clientName: "Acme", summary: "Clicks rose 12%.", reportId: "a1", nextStep: "Refresh the pricing page." });
  });

  it("names the platforms the analysis was built from", () => {
    const [acme] = latestInsightsPerClient([row({})]);
    expect(acme.platforms.length).toBe(2);
    expect(acme.platforms.join(" ")).toMatch(/Search Console/);
  });

  it("skips archived clients, reports with no client and blank summaries, and caps the list", () => {
    expect(
      latestInsightsPerClient([
        row({ client_id: null }),
        row({ client_id: "x", summary: "  " }),
        row({ client_id: "y", clients: { name: "Old", archived: true } }),
      ])
    ).toEqual([]);
    const many = Array.from({ length: 6 }, (_, i) => row({ id: `r${i}`, client_id: `c${i}` }));
    expect(latestInsightsPerClient(many, 4)).toHaveLength(4);
  });

  it("ignores malformed stored lists rather than throwing", () => {
    const [a] = latestInsightsPerClient([row({ actions: "not a list" as unknown as string[], issues: [3 as unknown as string, " Rank fell. "] })]);
    expect(a.nextStep).toBeNull();
    expect(a.issue).toBe("Rank fell.");
  });
});

describe("siteLabel", () => {
  it("shows a Search Console property the way people name it", () => {
    expect(siteLabel("sc-domain:acme.com")).toBe("acme.com");
    expect(siteLabel("https://www.acme.com/")).toBe("www.acme.com");
    expect(siteLabel(null)).toBeNull();
  });
});

describe("forClient", () => {
  it("stamps each signal with its own client and account", () => {
    const s = { kind: "traffic_spike", title: "t", detail: "d", metric: "+1", changePct: 1, confidence: "low", confidenceReason: "r", source: "Search Console", weight: 1 } as Signal;
    const [out] = forClient([s], { clientId: "a", clientName: "Acme", account: "acme.com" });
    expect(out).toMatchObject({ context: "Acme", owner: { clientId: "a", clientName: "Acme", account: "acme.com" } });
    expect(s).not.toHaveProperty("owner");
  });
});

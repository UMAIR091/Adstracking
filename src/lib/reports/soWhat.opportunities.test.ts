// Opportunities, not only problems.
//
// The recommendation engine read declines, zero-conversion spend and unclicked
// impressions, and nothing else. On an account where a channel was plainly
// working the report therefore carried no recommendation about it at all —
// neither "protect this" nor "consider scaling this" — and read as a list of
// faults. These cover the other half, and equally the cases where staying quiet
// is the correct behaviour.
import { describe, expect, it } from "vitest";
import { allActions, allSoWhat, blockActions, NO_EVIDENCE_NOTE } from "./soWhat";
import type { Signal } from "@/lib/insights/signals";
import type { BlockKpi, ReportBlock } from "@/lib/integrations/blocks";

const signal = (over: Partial<Signal> = {}): Signal => ({
  kind: "winning_keyword",
  title: "“running shoes” is climbing",
  detail: "“running shoes” gained 142% more clicks than the previous period.",
  metric: "+142%",
  changePct: 142,
  confidence: "high",
  confidenceReason: "Based on 1,240 clicks across the full period.",
  source: "Search Console",
  weight: 80,
  ...over,
});

const block = (over: Partial<ReportBlock> = {}): ReportBlock =>
  ({
    sourceId: "meta_ads",
    sourceName: "Meta Ads",
    category: "paid",
    currency: "USD",
    kpis: [] as BlockKpi[],
    series: [],
    tables: [],
    notes: [],
    ...over,
  }) as ReportBlock;

/** Meta Ads, converting, with a return the platform itself reports. */
const converting = (over: Partial<ReportBlock> = {}): ReportBlock =>
  block({
    kpis: [
      { label: "Spend", value: 4200, previous: 3780, format: "currency" },
      { label: "Clicks", value: 3100, previous: null, format: "number" },
      { label: "Conversions", value: 120, previous: null, format: "number" },
      { label: "Cost per conversion", value: 35, previous: 42, format: "currency", lowerBetter: true },
      { label: "Revenue", value: 12600, previous: null, format: "currency" },
      { label: "ROAS", value: 3, previous: null, format: "number" },
    ],
    ...over,
  });

const failing = (over: Partial<ReportBlock> = {}): ReportBlock =>
  block({
    sourceId: "tiktok_ads",
    sourceName: "TikTok Ads",
    kpis: [
      { label: "Spend", value: 228, previous: null, format: "currency" },
      { label: "Conversions", value: 0, previous: null, format: "number" },
    ],
    ...over,
  });

const campaigns = (rows: { name: string; spend: number; conversions: number }[]): ReportBlock["tables"][number] => ({
  title: "Top campaigns",
  columns: [
    { key: "name", label: "Campaign", format: "number" },
    { key: "spend", label: "Spend", format: "currency" },
    { key: "conversions", label: "Conversions", format: "number" },
  ],
  rows,
});

describe("blockActions on a channel that is working", () => {
  it("recommends holding or scaling against the reported return", () => {
    const [a] = blockActions([converting()]);
    expect(a.kind).toBe("opportunity");
    expect(a.action).toMatch(/hold or increase Meta Ads budget/i);
    expect(a.because).toMatch(/3\.0x/);
    expect(a.because).toMatch(/\$4,200/);
    expect(a.priority).toBe("High");
  });

  it("never claims a return the platform did not report", () => {
    const noRoas = block({
      kpis: [
        { label: "Spend", value: 4200, previous: null, format: "currency" },
        { label: "Conversions", value: 120, previous: null, format: "number" },
      ],
    });
    expect(blockActions([noRoas])).toEqual([]);
  });

  it("reads an improving cost per conversion from the platform's own before and after", () => {
    const improving = block({
      kpis: [
        { label: "Spend", value: 4200, previous: 3780, format: "currency" },
        { label: "Conversions", value: 120, previous: 90, format: "number" },
        { label: "Cost per conversion", value: 35, previous: 42, format: "currency", lowerBetter: true },
      ],
    });
    const [a] = blockActions([improving]);
    expect(a.kind).toBe("opportunity");
    expect(a.because).toMatch(/down 17% to \$35/);
  });

  it("stays quiet on efficiency without a previous figure to compare", () => {
    const noBaseline = block({
      kpis: [
        { label: "Spend", value: 4200, previous: null, format: "currency" },
        { label: "Conversions", value: 120, previous: null, format: "number" },
        { label: "Cost per conversion", value: 35, previous: null, format: "currency", lowerBetter: true },
      ],
    });
    expect(blockActions([noBaseline])).toEqual([]);
  });

  it("names the highest-converting campaign from the channel's own table", () => {
    const withTable = converting({
      tables: [campaigns([
        { name: "Prospecting — video", spend: 900, conversions: 34 },
        { name: "Retargeting — carousel", spend: 800, conversions: 61 },
      ])],
    });
    const step = blockActions([withTable]).find((a) => /Retargeting/.test(a.action));
    expect(step).toBeDefined();
    expect(step!.because).toMatch(/61 conversions on \$800 of spend/);
  });

  it("does not call the only row of a table a top campaign", () => {
    const oneRow = converting({ tables: [campaigns([{ name: "Prospecting", spend: 900, conversions: 34 }])] });
    expect(blockActions([oneRow]).some((a) => /Prospecting/.test(a.action))).toBe(false);
  });

  it("keeps the campaign step to the heaviest-spending channel", () => {
    const meta = converting({
      tables: [campaigns([
        { name: "Meta A", spend: 900, conversions: 34 },
        { name: "Meta B", spend: 800, conversions: 20 },
      ])],
    });
    const tiktok = block({
      sourceId: "tiktok_ads",
      sourceName: "TikTok Ads",
      kpis: [
        { label: "Spend", value: 900, previous: null, format: "currency" },
        { label: "Conversions", value: 20, previous: null, format: "number" },
        { label: "ROAS", value: 3, previous: null, format: "number" },
      ],
      tables: [campaigns([
        { name: "TikTok A", spend: 400, conversions: 12 },
        { name: "TikTok B", spend: 300, conversions: 6 },
      ])],
    });
    const actions = blockActions([meta, tiktok]);
    expect(actions.filter((a) => /as the reference for the rest of/.test(a.action))).toHaveLength(1);
    expect(actions.some((a) => /Meta A/.test(a.action))).toBe(true);
  });

  it("compares efficiency across channels when both report a price", () => {
    const dear = block({
      sourceId: "tiktok_ads",
      sourceName: "TikTok Ads",
      kpis: [
        { label: "Spend", value: 2600, previous: null, format: "currency" },
        { label: "Conversions", value: 41, previous: null, format: "number" },
        { label: "Cost per conversion", value: 63, previous: null, format: "currency", lowerBetter: true },
      ],
    });
    const shift = blockActions([converting(), dear]).find((a) => /Test moving part of/.test(a.action));
    expect(shift).toBeDefined();
    expect(shift!.because).toMatch(/\$35 against \$63/);
    expect(shift!.source).toBe("Meta Ads · TikTok Ads");
  });

  it("stays silent on a price difference too small to act on", () => {
    const near = block({
      sourceId: "tiktok_ads",
      sourceName: "TikTok Ads",
      kpis: [
        { label: "Spend", value: 2600, previous: null, format: "currency" },
        { label: "Conversions", value: 41, previous: null, format: "number" },
        { label: "Cost per conversion", value: 38, previous: null, format: "currency", lowerBetter: true },
      ],
    });
    expect(blockActions([converting(), near]).some((a) => /Test moving part of/.test(a.action))).toBe(false);
  });
});

describe("allActions mixing risks and opportunities", () => {
  it("leads with the problem when a risk and an opportunity share a priority", () => {
    const [first] = allActions([], [converting(), failing()]);
    expect(first.kind).toBe("risk");
  });

  it("keeps a place for an opportunity when problems would fill the list", () => {
    const risks: Signal[] = [
      signal({ kind: "declining_keyword", confidence: "high", weight: 90, detail: "term A fell 40%." }),
      signal({ kind: "traffic_drop", confidence: "high", weight: 88, detail: "a dip on Jul 4." }),
      signal({ kind: "conversion_opportunity", confidence: "high", weight: 78, detail: "2.1% of sessions convert." }),
    ];
    const out = allActions(risks, [converting()], 3);
    expect(out).toHaveLength(3);
    expect(out.some((a) => a.kind === "opportunity")).toBe(true);
  });

  it("invents no opportunity when the data produced none", () => {
    const risks: Signal[] = [
      signal({ kind: "declining_keyword", confidence: "high", weight: 90, detail: "term A fell 40%." }),
      signal({ kind: "traffic_drop", confidence: "high", weight: 88, detail: "a dip on Jul 4." }),
    ];
    const out = allActions(risks, [], 3);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((a) => a.kind === "risk")).toBe(true);
  });

  it("de-duplicates the same step arriving twice", () => {
    const texts = allActions([], [converting(), converting()], 5).map((a) => a.action);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("allSoWhat representing every source", () => {
  it("keeps a place for a channel reading when Google signals would fill the limit", () => {
    const many = [
      signal({ detail: "fact 1" }),
      signal({ kind: "declining_keyword", detail: "fact 2" }),
      signal({ kind: "opportunity", detail: "fact 3" }),
    ];
    const out = allSoWhat(many, [converting()], 3);
    expect(out).toHaveLength(3);
    expect(out.map((w) => w.source)).toContain("Meta Ads");
  });

  it("does not reserve a place when there is no channel reading to make", () => {
    const many = [signal({ detail: "fact 1" }), signal({ kind: "declining_keyword", detail: "fact 2" })];
    const out = allSoWhat(many, [block({ kpis: [{ label: "Impressions", value: 900, previous: null, format: "number" }] })], 2);
    expect(out.map((w) => w.source)).toEqual(["Search Console", "Search Console"]);
  });
});

describe("evidence-first language", () => {
  it("makes no claim about competitors or what usually happens", () => {
    const kinds: Signal["kind"][] = [
      "winning_keyword", "declining_keyword", "winning_page", "opportunity",
      "traffic_spike", "traffic_drop", "conversion_opportunity",
    ];
    const meanings = allSoWhat(kinds.map((kind) => signal({ kind, detail: kind })), [], kinds.length)
      .map((w) => w.meaning)
      .join(" ");
    expect(meanings).not.toMatch(/competitor/i);
    expect(meanings).not.toMatch(/\busually\b/i);
    expect(meanings).not.toMatch(/\btypically\b/i);
    expect(meanings).not.toMatch(/\bindustry\b/i);
  });
});

// When nothing clears the bar, the report used to render no Recommended
// actions section at all — which reads as an omission rather than a finding.
// The client cannot tell whether the report had no advice or forgot to give
// any, and the space is exactly where a weak signal gets softened into a
// recommendation to fill it.
describe("the no-evidence statement", () => {
  it("recommends waiting rather than acting", () => {
    expect(NO_EVIDENCE_NOTE).toMatch(/no optimization decision should be made/i);
    expect(NO_EVIDENCE_NOTE).toMatch(/a further period of data is needed/i);
  });

  it("claims nothing about the data beyond its insufficiency", () => {
    // No verdict on performance, and no figure — there is no measurement
    // behind this line, so it must not read as though there were.
    for (const claim of [/improved/i, /declined/i, /grew/i, /rose/i, /fell/i, /success/i]) {
      expect(NO_EVIDENCE_NOTE).not.toMatch(claim);
    }
    expect(NO_EVIDENCE_NOTE).not.toMatch(/[0-9]/);
  });

  it("is what the report has to fall back on: no data produces no actions", () => {
    expect(allActions([], [])).toEqual([]);
    expect(allSoWhat([], [])).toEqual([]);
  });
});

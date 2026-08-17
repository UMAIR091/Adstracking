import { describe, expect, it } from "vitest";
import { buildSoWhat, buildActions, blockActions, allActions } from "./soWhat";
import type { Signal } from "@/lib/insights/signals";
import type { ReportBlock } from "@/lib/integrations/blocks";

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

describe("buildSoWhat", () => {
  it("pairs the measured observation with an interpretation", () => {
    const [w] = buildSoWhat([signal()]);
    // The observation is the signal's own sentence — not rewritten.
    expect(w.observation).toBe("“running shoes” gained 142% more clicks than the previous period.");
    expect(w.meaning).toMatch(/further investment/i);
    expect(w.metric).toBe("+142%");
    expect(w.source).toBe("Search Console");
  });

  it("carries the confidence and its reason so a reader can weigh it", () => {
    const [w] = buildSoWhat([signal({ confidence: "low", confidenceReason: "Only 3 days of data." })]);
    expect(w.confidence).toBe("low");
    expect(w.confidenceReason).toBe("Only 3 days of data.");
  });

  it("gives every signal kind a meaning, so none renders blank", () => {
    const kinds: Signal["kind"][] = [
      "winning_keyword", "declining_keyword", "winning_page", "opportunity",
      "traffic_spike", "traffic_drop", "conversion_opportunity",
    ];
    for (const kind of kinds) {
      const [w] = buildSoWhat([signal({ kind })]);
      expect(w.meaning.length).toBeGreaterThan(20);
    }
  });

  it("caps the opening page so the 60-second read holds", () => {
    const many = Array.from({ length: 9 }, (_, i) => signal({ detail: `fact ${i}` }));
    expect(buildSoWhat(many, 3)).toHaveLength(3);
  });

  it("returns nothing when nothing was measured", () => {
    expect(buildSoWhat([])).toEqual([]);
  });
});

describe("buildActions", () => {
  it("attaches the measurement that prompted each step", () => {
    const [a] = buildActions([signal()]);
    expect(a.action).toMatch(/expand the content/i);
    expect(a.because).toBe("“running shoes” gained 142% more clicks than the previous period.");
  });

  it("derives priority from confidence and weight, not list position", () => {
    const strong = buildActions([signal({ confidence: "high", weight: 80 })])[0];
    const weak = buildActions([signal({ confidence: "low", weight: 10 })])[0];
    expect(strong.priority).toBe("High");
    expect(weak.priority).toBe("Low");
  });

  it("orders by priority regardless of input order", () => {
    const actions = buildActions([
      signal({ kind: "opportunity", confidence: "low", weight: 5 }),
      signal({ kind: "traffic_drop", confidence: "high", weight: 90 }),
    ]);
    expect(actions[0].priority).toBe("High");
  });

  it("de-duplicates the same step from repeated signals of one kind", () => {
    const actions = buildActions([
      signal({ detail: "term A rose 40%." }),
      signal({ detail: "term B rose 30%." }),
      signal({ detail: "term C rose 20%." }),
    ]);
    expect(actions).toHaveLength(1);
  });

  it("returns nothing without evidence", () => {
    expect(buildActions([])).toEqual([]);
  });
});

const paidBlock = (kpis: { label: string; value: number | null }[]): ReportBlock =>
  ({
    sourceId: "meta_ads", sourceName: "Meta Ads", category: "paid", currency: "USD",
    kpis: kpis.map((k) => ({ ...k, previous: null, format: "number" as const })),
    series: [], tables: [], notes: [],
  }) as unknown as ReportBlock;

describe("blockActions", () => {
  it("flags spend with no conversions, quoting the real figure", () => {
    const [a] = blockActions([paidBlock([
      { label: "Spend", value: 1200 },
      { label: "Conversions", value: 0 },
    ])]);
    expect(a.priority).toBe("High");
    expect(a.action).toMatch(/conversion tracking/i);
    expect(a.because).toMatch(/\$1,200/);
    expect(a.because).toMatch(/no conversions/);
  });

  it("flags spend with no clicks", () => {
    const [a] = blockActions([paidBlock([
      { label: "Spend", value: 500 },
      { label: "Clicks", value: 0 },
    ])]);
    expect(a.action).toMatch(/creative and targeting/i);
  });

  it("says nothing when conversions aren't tracked at all", () => {
    // No Conversions KPI: the channel isn't measuring them, so accusing it of
    // failing to convert would be an invented conclusion.
    expect(blockActions([paidBlock([{ label: "Spend", value: 900 }])])).toEqual([]);
  });

  it("says nothing when the channel is converting", () => {
    expect(blockActions([paidBlock([
      { label: "Spend", value: 900 },
      { label: "Conversions", value: 12 },
    ])])).toEqual([]);
  });

  it("ignores non-paid channels", () => {
    const organic = { ...paidBlock([{ label: "Spend", value: 100 }, { label: "Conversions", value: 0 }]), category: "organic" } as ReportBlock;
    expect(blockActions([organic])).toEqual([]);
  });

  it("never invents a figure when spend is uncalculable", () => {
    expect(blockActions([paidBlock([
      { label: "Spend", value: null },
      { label: "Conversions", value: 0 },
    ])])).toEqual([]);
  });
});

describe("allActions", () => {
  it("merges channel and signal evidence, strongest first", () => {
    const actions = allActions(
      [signal({ kind: "opportunity", confidence: "low", weight: 5 })],
      [paidBlock([{ label: "Spend", value: 1000 }, { label: "Conversions", value: 0 }])],
    );
    expect(actions[0].priority).toBe("High");
    expect(actions[0].source).toBe("Meta Ads");
    expect(actions.length).toBeGreaterThan(1);
  });

  it("stays concise on sparse data instead of padding", () => {
    expect(allActions([], [])).toEqual([]);
  });
});

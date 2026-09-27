// The prompt's two contracts: with the deterministic layer, and with the schema.
//
// The report prints anomalies computed from the client's own variance
// (lib/insights/signals.ts). The model writes the prose beside them. If the
// model is told nothing about those flags it will happily narrate its own
// "spike" from ordinary noise — confident, unfalsifiable, and contradicting
// the figures printed inches away. These tests pin the handshake, and the
// writing rules that keep the prose honest about what it cannot know.
import { describe, it, expect } from "vitest";
import { buildPrompt, SYSTEM, SCHEMA } from "./prompt";
import type { InsightsInput } from "./types";

const base: InsightsInput = {
  clientName: "Acme Running Co",
  periodLabel: "1–28 September 2026",
  gsc: {
    totals: { clicks: 120, impressions: 4000, ctr: 0.03, position: 12.4 },
    previousTotals: { clicks: 100, impressions: 3800, ctr: 0.026, position: 13.1 },
    topQueries: [],
    topPages: [],
  },
};

describe("deterministic anomaly flags reach the model", () => {
  it("says plainly that nothing was flagged, rather than staying silent", () => {
    const prompt = buildPrompt({ ...base, signals: [] });

    expect(prompt).toContain("DETERMINISTIC ANOMALY FLAGS");
    expect(prompt).toContain("The anomaly check ran and raised nothing for this period");
    // The instruction has to travel with the absence, not just the presence.
    expect(prompt).toMatch(/do not describe any movement as a spike, drop or anomaly/i);
  });

  it("says the same when the field is missing entirely", () => {
    const prompt = buildPrompt(base);
    expect(prompt).toContain("The anomaly check ran and raised nothing for this period");
  });

  it("passes each flag through with its figure and earned confidence", () => {
    const prompt = buildPrompt({
      ...base,
      signals: [
        { title: "Traffic spike on 12 Sep", detail: "Clicks reached 61 against a typical 22.", metric: "61 clicks", confidence: "high" },
        { title: "Near page one", detail: "\"trail shoes\" sits at position 11.2.", metric: "position 11.2", confidence: "low" },
      ],
    });

    expect(prompt).toContain("Traffic spike on 12 Sep");
    expect(prompt).toContain("61 clicks; high confidence");
    expect(prompt).toContain("position 11.2; low confidence");
    expect(prompt).not.toContain("raised nothing for this period");
  });
});

describe("the system prompt forbids manufactured causation", () => {
  it("bans the causal phrasings outright", () => {
    expect(SYSTEM).toMatch(/Never claim causation/);
    expect(SYSTEM).toContain("This caused");
    expect(SYSTEM).toContain("This resulted in");
    // The permitted alternatives have to be offered, or the model just goes quiet.
    expect(SYSTEM).toContain("likely driven by");
  });

  it("tells the model it cannot detect anomalies itself", () => {
    expect(SYSTEM).toMatch(/you do not detect anomalies yourself/i);
    expect(SYSTEM).toMatch(/Never call something an anomaly without a given flag/i);
    expect(SYSTEM).toMatch(/never soften one you were given/i);
  });
});

describe("every insight commits to a mode", () => {
  // A hedge and a commitment are both honest. The sentence that reads as
  // analysis while asserting nothing is the one that wastes the client's time,
  // so the prompt offers exactly two shapes and forbids the space between them.
  it("defines both modes and when each applies", () => {
    expect(SYSTEM).toContain("COMMIT MODE");
    expect(SYSTEM).toContain("HEDGE MODE");
    expect(SYSTEM).toMatch(/when two or more metrics move together clearly/i);
    expect(SYSTEM).toMatch(/sample size is small, data is missing, or the signal is ambiguous/i);
  });

  it("closes the gap between them", () => {
    expect(SYSTEM).toMatch(/Never write a flat, uncommitted middle-ground sentence/i);
  });

  it("refuses to fill space when the period was quiet", () => {
    expect(SYSTEM).toMatch(/Do not manufacture an insight to fill space/i);
  });
});

describe("the format section matches the schema the model must return", () => {
  // The schema is what the provider enforces; the prompt is what the model
  // reads. A field added to one and not the other is answered blind.
  it("names every schema field", () => {
    for (const field of Object.keys(SCHEMA.properties)) {
      expect(SYSTEM).toContain(field);
    }
  });

  it("asks for one summary sentence and one closing recommendation", () => {
    expect(SYSTEM).toMatch(/executiveSummary: ONE sentence/);
    expect(SYSTEM).toMatch(/recommendedActions: exactly ONE item/);
  });

  it("allows an insight field to come back empty rather than padded", () => {
    expect(SYSTEM).toMatch(/TWO TO FOUR INSIGHTS IN TOTAL/);
    expect(SYSTEM).toMatch(/nothing real to say gets an empty array/i);
  });
});

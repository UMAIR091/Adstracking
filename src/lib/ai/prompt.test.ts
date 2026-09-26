// The prompt's contract with the deterministic layer.
//
// The report prints anomalies computed from the client's own variance
// (lib/insights/signals.ts). The model writes the prose beside them. If the
// model is told nothing about those flags it will happily narrate its own
// "spike" from ordinary noise — confident, unfalsifiable, and contradicting
// the figures printed inches away. These tests pin the handshake.
import { describe, it, expect } from "vitest";
import { buildPrompt, SYSTEM } from "./prompt";
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
    expect(SYSTEM).toContain("CORRELATION, NEVER MANUFACTURED CAUSATION");
    expect(SYSTEM).toContain("This caused");
    expect(SYSTEM).toMatch(/FRAME IT AS A HYPOTHESIS/);
  });

  it("tells the model it cannot detect anomalies itself", () => {
    expect(SYSTEM).toMatch(/you do not detect anomalies yourself/i);
    expect(SYSTEM).toContain("RESPECT THE DETERMINISTIC SIGNALS");
  });

  it("requires uncertainty to be stated rather than smoothed over", () => {
    expect(SYSTEM).toContain("NAME UNCERTAINTY OUT LOUD");
    expect(SYSTEM).toMatch(/too small to call a clear trend/i);
  });
});

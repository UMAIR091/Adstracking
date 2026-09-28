import { describe, it, expect, afterEach } from "vitest";
import { AWAITING_PROVIDER_APPROVAL, effectiveStatus, getIntegration, isConnectable } from "./registry";

const saved = process.env.LIVE_INTEGRATIONS;
afterEach(() => {
  if (saved === undefined) delete process.env.LIVE_INTEGRATIONS;
  else process.env.LIVE_INTEGRATIONS = saved;
});

describe("integrations awaiting provider approval", () => {
  // The audit finding: LIVE_INTEGRATIONS in Vercel listed these, so the
  // homepage advertised them as "Live" while outside agencies couldn't connect.
  it("never reads as live, even when LIVE_INTEGRATIONS lists them", () => {
    process.env.LIVE_INTEGRATIONS = Array.from(AWAITING_PROVIDER_APPROVAL).join(",") + ",gsc";
    for (const id of Array.from(AWAITING_PROVIDER_APPROVAL)) {
      const def = getIntegration(id);
      if (!def || def.status !== "live") continue; // not coded live → nothing to hold
      expect(effectiveStatus(def), id).toBe("soon");
      expect(isConnectable(def), id).toBe(false);
    }
  });

  it("leaves approved integrations governed by the allowlist", () => {
    process.env.LIVE_INTEGRATIONS = "gsc";
    const gsc = getIntegration("gsc")!;
    expect(effectiveStatus(gsc)).toBe("live");
  });
});

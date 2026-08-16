import { describe, expect, it } from "vitest";
import { getIntegrationName, mappedIntegrationIds } from "./names";
import { listIntegrations } from "./registry";

// The names map is client-safe and therefore separate from the registry, which
// means the two can drift. They did: the map carried 10 of 32 providers, so the
// clients list rendered raw keys like "pinterest_ads" to users. This test makes
// that failure loud at build time instead of visible in the product.
describe("integration display names", () => {
  it("names every integration in the registry", () => {
    const mapped = new Set(mappedIntegrationIds());
    const missing = listIntegrations()
      .map((d) => d.id)
      .filter((id) => !mapped.has(id));
    expect(missing).toEqual([]);
  });

  it("matches the registry's own display name for every integration", () => {
    const mismatched = listIntegrations()
      .filter((d) => getIntegrationName(d.id) !== d.name)
      .map((d) => `${d.id}: names="${getIntegrationName(d.id)}" registry="${d.name}"`);
    expect(mismatched).toEqual([]);
  });

  it("never returns a raw snake_case key for an unknown id", () => {
    expect(getIntegrationName("some_new_provider")).toBe("Some New Provider");
  });
});

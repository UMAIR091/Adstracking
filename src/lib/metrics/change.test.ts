import { describe, expect, it } from "vitest";
import { pctChange } from "./change";

describe("pctChange", () => {
  it("is the change relative to the previous value", () => {
    expect(pctChange(120, 100)).toBeCloseTo(20);
    expect(pctChange(80, 100)).toBeCloseTo(-20);
    expect(pctChange(100, 100)).toBe(0);
  });

  it("has no percentage from a zero baseline", () => {
    expect(pctChange(50, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });

  it("has none when either value is missing or not a number", () => {
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(100, null)).toBeNull();
    expect(pctChange(undefined, 100)).toBeNull();
    expect(pctChange(NaN, 100)).toBeNull();
    expect(pctChange(100, Infinity)).toBeNull();
  });

  it("reads a rise as positive from a negative baseline", () => {
    expect(pctChange(-50, -100)).toBeCloseTo(50);
    expect(pctChange(-150, -100)).toBeCloseTo(-50);
  });
});

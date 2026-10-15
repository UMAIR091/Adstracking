import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The signed-in app palette lives in three blocks in globals.css: light, the
// system-dark media block and the explicit [data-theme="dark"] block. The light
// block outranks the base dark palette, so a token it sets that a dark block
// forgets keeps its LIGHT value in dark mode (the "explicit-dark trap" that
// once left Help and Onboarding grey behind white text). This keeps the three
// blocks in step.

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `missing block ${selector}`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

const tokens = (body: string) =>
  new Set(Array.from(body.matchAll(/(--[a-z0-9-]+)\s*:/g), (m) => m[1]));

describe("app palette blocks", () => {
  const light = tokens(block(":root:has(.app-root)"));
  const systemDark = tokens(block(':root:not([data-theme="light"]):has(.app-root)'));
  const explicitDark = tokens(block(':root[data-theme="dark"]:has(.app-root)'));

  it("restate every light token in the system-dark block", () => {
    expect([...light].filter((t) => !systemDark.has(t))).toEqual([]);
  });

  it("restate every light token in the explicit-dark block", () => {
    expect([...light].filter((t) => !explicitDark.has(t))).toEqual([]);
  });

  it("keep both dark blocks identical", () => {
    const sys = block(':root:not([data-theme="light"]):has(.app-root)').replace(/\/\*.*?\*\//g, "").replace(/\s+/g, " ").trim();
    const exp = block(':root[data-theme="dark"]:has(.app-root)').replace(/\/\*.*?\*\//g, "").replace(/\s+/g, " ").trim();
    expect(exp).toBe(sys);
  });
});

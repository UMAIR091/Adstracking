import { describe, expect, it } from "vitest";
import { agencyNote, cleanBullets, cleanCommentary } from "./commentary";

describe("cleanCommentary", () => {
  it("drops a bare ordinal — the artefact that shipped as “1. 1”", () => {
    expect(cleanCommentary(["1"])).toEqual([]);
    expect(cleanCommentary(["1.", "2)", "- ", "•"])).toEqual([]);
  });

  it("strips list numbering the model added to an already-numbered list", () => {
    const [out] = cleanCommentary([
      "1. Publish a beginners buying guide targeting the position-10.8 cluster.",
    ]);
    expect(out).toBe("Publish a beginners buying guide targeting the position-10.8 cluster.");
  });

  it("strips bullet and bracketed markers too", () => {
    expect(cleanCommentary(["- Rebuild the sale collection page with unique copy."])[0])
      .toBe("Rebuild the sale collection page with unique copy.");
    expect(cleanCommentary(["(2) Rebuild the sale collection page with unique copy."])[0])
      .toBe("Rebuild the sale collection page with unique copy.");
  });

  it("drops fragments too short to be commentary", () => {
    expect(cleanCommentary(["Fix the gallery", "Do better"])).toEqual([]);
  });

  it("drops items that are mostly digits and punctuation", () => {
    expect(cleanCommentary(["1,240 / 22,100 — 5.6% / 3.2 (—)"])).toEqual([]);
  });

  it("keeps a genuine recommendation untouched apart from its marker", () => {
    const text = "Rebuild the sale collection page with unique copy and feature it in the July newsletter.";
    expect(cleanCommentary([text])).toEqual([text]);
  });

  it("de-duplicates repeated items", () => {
    const text = "Rebuild the sale collection page with unique copy and feature it in July.";
    expect(cleanCommentary([text, `1. ${text}`, text.toUpperCase()])).toEqual([text]);
  });

  it("drops an item the evidence-backed steps already state verbatim", () => {
    const step = "Review the conversion path for the highest-traffic landing pages.";
    expect(cleanCommentary([step], [step])).toEqual([]);
  });

  it("drops a reworded restatement of an evidence-backed step", () => {
    const step = "Test moving part of the TikTok Ads budget to Meta Ads and compare cost per conversion again next period.";
    const reworded = "Shift a share of the TikTok Ads budget to Meta Ads, comparing cost per conversion again next period.";
    expect(cleanCommentary([reworded], [step])).toEqual([]);
  });

  it("keeps commentary that genuinely adds something the steps don't say", () => {
    const step = "Confirm conversion tracking is firing for Meta Ads, then review targeting and landing pages.";
    const extra = "Add a post-purchase email flow promoting the care kit, where attach rate is currently 4%.";
    expect(cleanCommentary([extra], [step])).toEqual([extra]);
  });


  it("drops a restatement that differs only by plural and synonym", () => {
    const step = "Test moving part of the TikTok Ads budget to Meta Ads and compare cost per conversion again next period.";
    const reworded = "Shift a share of the TikTok Ads budget to Meta Ads, where a conversion costs $35 against $63.";
    expect(cleanCommentary([reworded], [step])).toEqual([]);
  });

  it("survives a null or non-string array without throwing", () => {
    expect(cleanCommentary(null)).toEqual([]);
    expect(cleanCommentary([undefined as unknown as string, 7 as unknown as string])).toEqual([]);
  });
});

describe("cleanBullets", () => {
  it("keeps a short but real bullet that the commentary bar would reject", () => {
    const b = "Revenue up 34% to $48,230";
    expect(cleanBullets([b])).toEqual([b]);
  });

  it("still drops numbering artefacts", () => {
    expect(cleanBullets(["2", "1.", "—"])).toEqual([]);
  });

  it("strips the marker from a numbered bullet", () => {
    expect(cleanBullets(["1. Carbon plate shoes up 142%"])).toEqual(["Carbon plate shoes up 142%"]);
  });

  it("de-duplicates", () => {
    expect(cleanBullets(["Clicks up 24%", "clicks up 24%!"])).toEqual(["Clicks up 24%"]);
  });
});

// The on-screen report opened an "Agency Notes" section whatever the agency had
// configured, filling it with a sentence they never wrote — under a heading
// reading "A note from your team". A note the agency did not write is better
// absent than invented on their behalf.
describe("agencyNote", () => {
  it("keeps a note the agency actually wrote", () => {
    const note = "Great momentum this month — we'll focus on the beginner audience next.";
    expect(agencyNote(note)).toBe(note);
  });

  it("returns nothing when no note is configured", () => {
    expect(agencyNote(null)).toBeNull();
    expect(agencyNote(undefined)).toBeNull();
    expect(agencyNote("")).toBeNull();
  });

  it("treats whitespace and stubs as no note at all", () => {
    for (const stub of ["   ", "\n\t ", "-", ".", "n/a", "tbd", "notes"]) {
      expect(agencyNote(stub)).toBeNull();
    }
  });

  it("tidies stray markers and spacing rather than rejecting the note", () => {
    expect(agencyNote("  - Reply to this email with any questions.  "))
      .toBe("Reply to this email with any questions.");
    expect(agencyNote("Questions?\n\nReply any time."))
      .toBe("Questions? Reply any time.");
  });

  it("never substitutes a note of its own", () => {
    // Whatever comes back is either the agency's own words or nothing.
    for (const input of [null, "", "  ", "x"]) {
      expect(agencyNote(input)).toBeNull();
    }
  });
});

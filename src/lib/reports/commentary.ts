// Sanitising the AI's free-text commentary before it reaches a client.
//
// The model returns `recommendedActions` as an array of sentences, and the
// renderer used to trust every element of it. A generated report shipped with a
// section titled "Further commentary" whose entire content was the string "1",
// rendered beside the card's own ordinal — reading, on the page, as "1. 1". A
// second report carried one bare fragment under a heading promising analysis.
//
// Both are the same defect: a list element that is a numbering artefact, a
// truncated fragment or a restatement of a step already given is not commentary,
// and a section that exists only because the array was non-empty is worse than
// no section at all. So the array is cleaned first, and the caller renders the
// section only if something survives.
//
// Nothing here rewrites meaning. It strips list markers the model added, drops
// items that cannot be a sentence, and removes duplicates — including items that
// merely repeat an evidence-backed action the report already states.

/** Leading list markers a model adds despite being asked for plain strings. */
const LEADING_MARKER = /^(?:\s*(?:\d{1,2}\s*[.):\]]|[-–—*•·>]|\(\s*\d{1,2}\s*\))\s*)+/;

/** Trailing artefacts: a dangling separator or an unterminated marker. */
const TRAILING_JUNK = /[\s\-–—*•·:;,]+$/;

function tidy(raw: string): string {
  let s = String(raw ?? "")
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(LEADING_MARKER, "").trim();
  // Markdown emphasis around a whole item carries no meaning in a PDF.
  s = s.replace(/^\*\*(.+?)\*\*$/, "$1").trim();
  s = s.replace(TRAILING_JUNK, "").trim();
  return s;
}

/** Comparison key: case, punctuation and spacing don't make two items distinct. */
function key(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * True when the item could be a sentence a client would accept as commentary.
 *
 * The bar is deliberately mechanical — length, word count, actual letters —
 * rather than a judgement about quality, so it can never silently drop a short
 * but genuine recommendation while letting "1" through.
 */
function isMeaningful(s: string): boolean {
  if (s.length < 25) return false;
  const words = s.split(" ").filter((w) => /[a-z]/i.test(w));
  if (words.length < 5) return false;
  // Mostly digits and punctuation is a table fragment, not prose.
  const letters = (s.match(/[a-z]/gi) ?? []).length;
  return letters >= s.length * 0.5;
}

// Words that carry no signal when comparing two recommendations for overlap.
const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "from",
  "at", "by", "as", "is", "are", "was", "were", "be", "been", "it", "its",
  "this", "that", "these", "those", "then", "than", "into", "onto", "over",
  "part", "some", "share", "more", "less", "next", "period", "against", "where",
  "while", "before", "after", "again", "any", "all", "each", "per",
]);

/**
 * Content words, crudely singularised so "cost" and "costs" — or "ads" and
 * "ad" — count as the same word. Without it a reworded step slipped through on
 * a plural: "…where a conversion costs $35" against "…compare cost per
 * conversion" fell just under the overlap bar and the client read the same
 * instruction twice.
 */
function contentWords(s: string): string[] {
  return key(s)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/**
 * True when a commentary item says substantially what an already-shown step
 * says. Exact-match de-duplication misses the common case: the model rewords a
 * step the evidence layer derived independently ("Shift a share of the TikTok
 * budget to Meta, where a conversion costs $35 against $63" beside "Test moving
 * part of the TikTok Ads budget to Meta Ads and compare cost per conversion"),
 * and the client reads the same instruction twice under two headings.
 */
function overlaps(candidate: string, existing: readonly string[]): boolean {
  const words = contentWords(candidate);
  if (words.length === 0) return true;
  const unique = Array.from(new Set(words));
  for (const e of existing) {
    const other = new Set(contentWords(e));
    if (other.size === 0) continue;
    const shared = unique.filter((w) => other.has(w)).length;
    if (shared / unique.length >= 0.6) return true;
  }
  return false;
}

/**
 * Cleans an AI commentary array.
 *
 * `exclude` holds text the report already presents elsewhere — the
 * evidence-backed recommended actions — so the commentary section adds to the
 * report instead of repeating it.
 */
export function cleanCommentary(items: readonly string[] | null | undefined, exclude: readonly string[] = []): string[] {
  const excluded = exclude.map(tidy).filter(Boolean);
  const seen = new Set(excluded.map(key));
  const out: string[] = [];
  for (const raw of items ?? []) {
    if (typeof raw !== "string") continue;
    const s = tidy(raw);
    if (!isMeaningful(s)) continue;
    const k = key(s);
    if (!k || seen.has(k)) continue;
    if (overlaps(s, [...excluded, ...out])) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/**
 * Cleans the shorter insight bullets (key wins, issues, opportunities).
 *
 * Same marker-stripping and duplicate rules, but a lower length bar: "Revenue
 * up 34% to $48,230" is a legitimate bullet and would fail the commentary test.
 */
export function cleanBullets(items: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items ?? []) {
    if (typeof raw !== "string") continue;
    const s = tidy(raw);
    // A bullet still has to read as a phrase. "Clicks up 24%" qualifies; "2"
    // and "—" do not.
    if (s.length < 12) continue;
    const words = s.split(" ").filter((w) => /[a-z]/i.test(w));
    if (words.length < 2) continue;
    const k = key(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

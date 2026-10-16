// Text that came from outside Anavyst — search queries, page paths, campaign,
// ad, product and channel names — printed into the AI prompt.
//
// It can hold anything a stranger typed into a search box or an advertiser
// typed into a campaign name, including text written to look like an
// instruction. Each label is flattened to one short line and its double quotes
// neutralised, so it can't break out of the quoting the prompt puts around it
// or start a line of its own. The system prompt tells the model that labels
// are data and never instructions (prompt.ts rule 11).
export const PROMPT_LABEL_MAX = 120;

export function promptLabel(raw: unknown, max = PROMPT_LABEL_MAX): string {
  const flat = String(raw ?? "")
    // Control characters, including newlines and the Unicode line separators.
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

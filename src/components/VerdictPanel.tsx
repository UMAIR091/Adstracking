"use client";

import type { Verdict } from "@/lib/reports/verdict";

/**
 * The verdict panel — the thirty-second answer.
 *
 * Sized deliberately larger than anything below it. The client who reads only
 * the top of the page is the normal case, not the failure case, so the layout
 * is built for them: headline, the money sentence, the direction of travel,
 * and the one thing to do. Everything else in the report is the evidence for
 * these four lines, available to whoever wants it.
 *
 * Laid out as the answers to three questions — "Is it working?" (the lines),
 * "Did it improve?" (the comparison) and "What happens next?" (the action). A
 * tile whose source is empty is omitted rather than filled with a stand-in.
 *
 * Tone is a claim about performance, so it is only coloured when the verdict
 * had a baseline to judge against; "neutral" renders in plain ink rather than
 * implying a result the figures don't support.
 *
 * Shared by the live report and the sample/preview so the marketing page can
 * never show a panel the product doesn't actually produce. Always the dark
 * card, whatever the agency colour: it is the one block that has to read
 * first on any brand.
 */
const TONE_DOT = {
  good: "#3DDC97",
  attention: "#F2A27A",
  mixed: "#E5A75F",
  neutral: "#9FB3AA",
} as const;

// `color` is still accepted so callers stay unchanged; the panel no longer
// needs the agency colour.
export function VerdictPanel({ v }: { v: Verdict; color?: string }) {
  const [first, ...rest] = v.lines;
  const tiles: { q: string; a: React.ReactNode }[] = [];
  if (first) {
    tiles.push({
      q: "Is it working?",
      a: (
        <>
          {first}
          {rest.map((l) => (
            <span key={l} className="mt-1.5 block text-[13.5px] text-report-verdict-muted">{l}</span>
          ))}
        </>
      ),
    });
  }
  if (v.comparison) tiles.push({ q: "Did it improve?", a: v.comparison });
  if (v.action) tiles.push({ q: "What happens next?", a: v.action });

  return (
    <section
      id="rs-the-verdict"
      data-report-section="—"
      data-report-label="The verdict"
      className="flex scroll-mt-24 break-inside-avoid flex-col gap-[18px] rounded-2xl bg-report-verdict p-7 text-report-verdict-fg"
    >
      <p className="flex items-center gap-2 font-report-mono text-[11px] uppercase tracking-[0.08em] text-report-verdict-accent">
        <span className="h-2 w-2 rounded-full" style={{ background: TONE_DOT[v.tone] }} aria-hidden />
        The verdict
      </p>
      <h2 className="text-[clamp(22px,3vw,30px)] font-semibold leading-[1.15] tracking-[-0.025em] [text-wrap:balance]">{v.headline}</h2>
      {tiles.length > 0 && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          {tiles.map((t) => (
            <div key={t.q} className="rounded-xl bg-white/[0.06] px-4 py-3.5">
              <p className="text-xs text-report-verdict-muted">{t.q}</p>
              <p className="mt-1.5 text-[15px] leading-[1.45]">{t.a}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

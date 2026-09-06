"use client";

import { TrendingUp, TrendingDown, Target } from "lucide-react";
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
 * Tone is a claim about performance, so it is only coloured when the verdict
 * had a baseline to judge against; "neutral" renders in plain ink rather than
 * implying a result the figures don't support.
 *
 * Shared by the live report and the sample/preview so the marketing page can
 * never show a panel the product doesn't actually produce.
 */
export function VerdictPanel({ v, color }: { v: Verdict; color: string }) {
  const tones = {
    good: { bar: "bg-success-500", head: "text-success-700", chip: "border-success-100 bg-success-50/70 text-success-700" },
    attention: { bar: "bg-danger-500", head: "text-danger-600", chip: "border-danger-100 bg-danger-50/70 text-danger-600" },
    mixed: { bar: "bg-warning-500", head: "text-warning-700", chip: "border-warning-100 bg-warning-50/70 text-warning-700" },
    neutral: { bar: "bg-ink-300", head: "text-ink-900", chip: "border-ink-200 bg-ink-50 text-ink-600" },
  } as const;
  const t = tones[v.tone];
  const Trend = v.comparisonGood ? TrendingUp : TrendingDown;

  return (
    <section className="break-inside-avoid overflow-hidden rounded-xl border border-ink-200">
      <div className="flex">
        <div className={`w-1.5 flex-shrink-0 ${t.bar}`} aria-hidden />
        <div className="min-w-0 flex-1 p-5 sm:p-6">
          <h2 className={`text-lg font-semibold leading-tight sm:text-xl ${t.head}`}>{v.headline}</h2>

          {/* The money sentence carries the most weight on the page. */}
          <p className="mt-2 text-base leading-relaxed text-ink-800 sm:text-lg">{v.lines[0]}</p>
          {v.lines.slice(1).map((l) => (
            <p key={l} className="mt-1.5 text-sm leading-relaxed text-ink-600">{l}</p>
          ))}

          {v.comparison && (
            <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${t.chip}`}>
              <Trend size={13} /> {v.comparison}
            </p>
          )}

          {v.action && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3.5 py-2.5">
              <Target size={14} className="mt-0.5 flex-shrink-0" style={{ color }} />
              <p className="text-xs leading-relaxed text-ink-700">
                <span className="font-semibold text-ink-900">Next: </span>{v.action}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

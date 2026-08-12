import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export type OnboardingStep = {
  label: string;
  done: boolean;
  href: string;
  /** Why this step matters — shown only on the step that's up next. */
  description?: string;
  /** Action label for the next step's button. Falls back to the label. */
  cta?: string;
};

export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const nextIndex = steps.findIndex((s) => !s.done);
  if (pct === 100) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Get set up</CardTitle>
            <CardDescription>Finish these to send your first report.</CardDescription>
          </div>
          <span className="whitespace-nowrap text-sm font-semibold text-brand-600">{doneCount} of {steps.length} steps completed</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-label="Setup progress"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {steps.map((s, i) => {
          const isNext = !s.done && i === nextIndex;
          return (
            <Link
              key={s.label}
              href={s.href}
              className={`group flex gap-3 rounded-lg px-2 py-2.5 transition-colors ${isNext ? "items-start bg-brand-50 ring-1 ring-brand-100 hover:bg-brand-100" : "items-center hover:bg-slate-50"}`}
            >
              {s.done ? (
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
              ) : (
                <Circle className={`h-5 w-5 flex-shrink-0 ${isNext ? "mt-0.5 text-brand-500" : "text-slate-300"}`} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${s.done ? "text-ink-500 line-through" : isNext ? "font-medium text-ink-900" : "text-ink-800"}`}>{s.label}</span>
                  {isNext && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Next</span>}
                </div>
                {/* The description earns its space only on the step being asked
                    for right now — on the others it would be a wall of text
                    about work that's already done or not yet relevant. */}
                {isNext && s.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{s.description}</p>
                )}
              </div>
              {isNext ? (
                <span className="mt-0.5 inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors group-hover:bg-brand-600">
                  {s.cta ?? s.label} <ArrowRight className="h-3.5 w-3.5" />
                </span>
              ) : (
                !s.done && <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300 group-hover:text-brand-500" />
              )}
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

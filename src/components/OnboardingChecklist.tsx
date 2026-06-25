import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export type OnboardingStep = { label: string; done: boolean; href: string };

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
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {steps.map((s, i) => {
          const isNext = !s.done && i === nextIndex;
          return (
            <Link
              key={s.label}
              href={s.href}
              className={`group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors ${isNext ? "bg-brand-50 ring-1 ring-brand-100 hover:bg-brand-100" : "hover:bg-slate-50"}`}
            >
              {s.done ? (
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
              ) : (
                <Circle className={`h-5 w-5 flex-shrink-0 ${isNext ? "text-brand-500" : "text-slate-300"}`} />
              )}
              <span className={`flex-1 text-sm ${s.done ? "text-ink-400 line-through" : isNext ? "font-medium text-ink-900" : "text-ink-800"}`}>{s.label}</span>
              {isNext && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Next</span>}
              {!s.done && <ArrowRight className={`h-4 w-4 ${isNext ? "text-brand-500" : "text-slate-300 group-hover:text-brand-500"}`} />}
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import { Check } from "lucide-react";

export type OnboardingStep = {
  label: string;
  done: boolean;
  href: string;
  /** Why this step matters — shown only on the step that's up next. */
  description?: string;
  /** Action label for the next step's button. Falls back to the label. */
  cta?: string;
};

/**
 * "Get set up" as a stepper: progress segments, finished steps struck through,
 * and ONLY the current step expanded with its one action, so the card always
 * says exactly what to do next. Every "done" comes from state the workspace
 * already records (see app/dashboard/page.tsx).
 */
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  const nextIndex = steps.findIndex((s) => !s.done);
  if (nextIndex === -1) return null;

  return (
    <section aria-labelledby="setup-heading" className="overflow-hidden rounded-2xl border border-ink-200 bg-surface">
      <div className="border-b border-ink-100 px-5 py-[18px]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="setup-heading" className="text-base font-semibold text-ink-900">Get set up</h2>
          <span className="font-app-mono text-xs text-ink-500">{doneCount} of {steps.length} done</span>
        </div>
        <div
          className="mt-3 flex gap-1"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
        >
          {steps.map((s) => (
            <span key={s.label} className={`h-[5px] flex-1 rounded-[3px] ${s.done ? "bg-brand-500" : "bg-ink-100"}`} />
          ))}
        </div>
      </div>
      <ol>
        {steps.map((s, i) => {
          const current = i === nextIndex;
          return (
            <li
              key={s.label}
              aria-current={current ? "step" : undefined}
              className={`flex gap-3.5 px-5 py-3.5 ${i ? "border-t border-ink-100" : ""} ${current ? "bg-ink-50" : ""}`}
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  s.done
                    ? "bg-brand-500 text-white"
                    : current
                      ? "bg-primary text-primary-fg"
                      : "border border-control-line bg-surface text-ink-400"
                }`}
              >
                {s.done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[14.5px] ${
                    s.done ? "font-medium text-ink-400 line-through" : current ? "font-semibold text-ink-900" : "font-medium text-ink-500"
                  }`}
                >
                  {s.label}
                  {s.done && <span className="sr-only"> (done)</span>}
                </p>
                {current && (
                  <>
                    {s.description && <p className="mt-1 text-[13.5px] leading-relaxed text-ink-500">{s.description}</p>}
                    <Link
                      href={s.href}
                      className="mt-3 inline-flex rounded-control bg-primary px-3.5 py-[9px] text-[13.5px] font-medium text-primary-fg transition-colors hover:bg-primary-hover"
                    >
                      {s.cta ?? s.label}
                    </Link>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

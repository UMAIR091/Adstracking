import Link from "next/link";
import { Check, X } from "lucide-react";
import { FREE_LIMITS } from "@/lib/billing/config";

// The Free plan, shown alongside the paid tiers.
//
// Rendered as a full-width band rather than a fifth column: it has no price, a
// different shape of limits, and two things the paid plans have that it does
// not. Squeezing it into the paid grid would imply it is the same kind of
// offer, and would leave five cramped cards where there were four.
//
// Limits come from FREE_LIMITS, the same constant lib/billing/limits enforces,
// so the page cannot advertise an allowance the app doesn't actually give.
const INCLUDED = [
  `${FREE_LIMITS.maxClients} active client`,
  `${FREE_LIMITS.maxIntegrationsPerClient} data sources`,
  `${FREE_LIMITS.maxReports} report a month`,
  "Full white-label branding",
];

const NOT_INCLUDED = ["Automated delivery", "AI-written insights"];

export function FreePlanCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-ink-200 bg-surface p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-sm font-medium text-ink-500">Free</p>
            <p className="text-2xl font-semibold text-ink-900">
              $0<span className="text-base font-normal text-ink-500">/mo</span>
            </p>
            <p className="text-sm text-ink-500">— no card, no time limit</p>
          </div>

          <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            {INCLUDED.map((f) => (
              <li key={f} className="flex items-center gap-1.5 text-sm text-ink-700">
                <Check size={15} className="shrink-0 text-ink-400" aria-hidden />
                {f}
              </li>
            ))}
            {NOT_INCLUDED.map((f) => (
              <li key={f} className="flex items-center gap-1.5 text-sm text-ink-400">
                <X size={15} className="shrink-0" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <Link
          href="/signup"
          className="focus-ring shrink-0 rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900"
        >
          Start on Free
        </Link>
      </div>
    </div>
  );
}

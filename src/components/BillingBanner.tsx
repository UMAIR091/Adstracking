import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";

// Dashboard-wide billing notice. Server component — rendered by the layout
// with precomputed state (no client JS). Quiet by design: nothing shows for
// healthy subscriptions or early trial days.
export function BillingBanner({
  hasAccess,
  blockedReason,
  trialDaysLeft,
  isTrial,
}: {
  hasAccess: boolean;
  blockedReason: string | null;
  trialDaysLeft: number | null;
  isTrial: boolean;
}) {
  if (!hasAccess) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-800">
        <span className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {blockedReason ?? "Subscription required to keep generating reports."}
        </span>
        <Link href="/dashboard/billing" className="shrink-0 rounded-lg bg-danger-solid px-3.5 py-1.5 font-medium text-white transition-colors hover:bg-danger-solid-hover">
          Choose a plan
        </Link>
      </div>
    );
  }

  if (isTrial && trialDaysLeft !== null && trialDaysLeft <= 7) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
        <span className="flex items-center gap-2">
          <Clock size={16} className="shrink-0" />
          {trialDaysLeft === 0
            ? "Your free trial ends today."
            : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial.`}{" "}
          Upgrade to keep reports flowing without interruption.
        </span>
        {/* Accent rather than amber: this is the primary upgrade action, so it
            gets the one filled-accent treatment on the page. */}
        <Link href="/dashboard/billing" className="shrink-0 rounded-lg bg-brand-solid px-3.5 py-1.5 font-medium text-white transition-colors hover:bg-brand-solid-hover">
          Upgrade
        </Link>
      </div>
    );
  }

  return null;
}

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <span className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {blockedReason ?? "Subscription required to keep generating reports."}
        </span>
        <Link href="/dashboard/billing" className="shrink-0 rounded-lg bg-red-600 px-3.5 py-1.5 font-medium text-white hover:bg-red-700">
          Choose a plan
        </Link>
      </div>
    );
  }

  if (isTrial && trialDaysLeft !== null && trialDaysLeft <= 7) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="flex items-center gap-2">
          <Clock size={16} className="shrink-0" />
          {trialDaysLeft === 0
            ? "Your free trial ends today."
            : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial.`}{" "}
          Upgrade to keep reports flowing without interruption.
        </span>
        <Link href="/dashboard/billing" className="shrink-0 rounded-lg bg-amber-600 px-3.5 py-1.5 font-medium text-white hover:bg-amber-700">
          Upgrade
        </Link>
      </div>
    );
  }

  return null;
}

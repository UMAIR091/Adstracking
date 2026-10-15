import Link from "next/link";

// Dashboard-wide billing notice. Server component — rendered by the layout
// with precomputed state (no client JS). Quiet by design: nothing shows for
// healthy subscriptions or early trial days. Shown as the app's slim tinted
// strip: amber for a trial running out, red once access has stopped.
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
      <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-danger-50 px-3.5 py-2.5 text-[13.5px] text-danger-700">
        <span className="min-w-[200px] flex-1 font-medium">
          {blockedReason ?? "Subscription required to keep generating reports."}
        </span>
        <Link href="/dashboard/billing" className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline">
          Choose a plan
        </Link>
      </div>
    );
  }

  if (isTrial && trialDaysLeft !== null && trialDaysLeft <= 7) {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-warning-50 px-3.5 py-2.5 text-[13.5px] text-warning-700">
        <span className="font-semibold">
          {trialDaysLeft === 0
            ? "Your free trial ends today."
            : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial.`}
        </span>
        <span className="min-w-[200px] flex-1">Upgrade to keep reports flowing without interruption.</span>
        <Link href="/dashboard/billing" className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline">
          Upgrade
        </Link>
      </div>
    );
  }

  return null;
}

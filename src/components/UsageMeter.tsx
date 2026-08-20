import Link from "next/link";
import { Users, TrendingUp } from "lucide-react";

// Always-visible plan usage (journey audit P1-7): shows remaining clients so a
// user is never surprised by a hard block, and nudges an upgrade at 80%+.
// Presentational — data comes from checkClientLimit() on the server.
export function ClientUsageMeter({ used, limit, planName, isTrial }: { used: number; limit: number | null; planName: string; isTrial: boolean }) {
  // Unlimited plan — reassure, don't meter.
  if (limit === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-500">
        <Users size={14} className="text-ink-400" />
        {used} {used === 1 ? "client" : "clients"} · Unlimited on {planName}
      </div>
    );
  }

  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const atLimit = used >= limit;
  const near = pct >= 80 && !atLimit;
  const barColor = atLimit ? "bg-danger-500" : near ? "bg-warning-500" : "bg-brand-500";

  return (
    <div className="w-full max-w-xs">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink-700">{used} of {limit} clients</span>
        <span className="text-ink-500">{isTrial ? "Free trial" : planName}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Client usage">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {(near || atLimit) && (
        <Link href="/dashboard/billing" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
          <TrendingUp size={13} />
          {atLimit ? "You've hit your limit — upgrade for more clients" : `Only ${limit - used} left — see upgrade options`}
        </Link>
      )}
    </div>
  );
}

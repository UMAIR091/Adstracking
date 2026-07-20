import Link from "next/link";
import { BarChart3, CheckCircle2, Circle, PlugZap, RefreshCw, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Empty states for the analytics surfaces.
//
// ReportFlow never renders invented numbers. Where there is no data, these
// components explain *why* and what to do next, so an empty dashboard reads as
// a deliberate first step rather than a broken page.

export type SetupStep = { label: string; done: boolean; href: string };

// Slim progress bar + step list, so a new user can see how far through setup
// they are without leaving the dashboard.
export function SetupProgress({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const next = steps.find((s) => !s.done);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink-800">Setup progress</p>
        <p className="text-xs text-ink-500">{done} of {steps.length} complete</p>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Setup progress"
      >
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 space-y-1">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
              {s.done
                ? <CheckCircle2 size={15} className="flex-shrink-0 text-emerald-500" />
                : <Circle size={15} className="flex-shrink-0 text-ink-300" />}
              <span className={`flex-1 text-sm ${s.done ? "text-ink-400 line-through" : "text-ink-700"}`}>{s.label}</span>
              {s === next && (
                <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Next
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Shown when the agency has no connected data source at all. The dashboard's
// primary call to action.
export function NoIntegrationsState({ hasClients, steps }: { hasClients: boolean; steps: SetupStep[] }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 ring-1 ring-inset ring-brand-100">
            <BarChart3 size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink-900">
              {hasClients ? "Connect your first integration to start generating reports" : "Add a client to start generating reports"}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              {hasClients
                ? "Link a client to Google Search Console, GA4, Meta Ads or any other supported source. Once connected, ReportFlow syncs their metrics automatically and your performance data appears here."
                : "Clients are the workspaces you report on. Add your first one, connect their marketing accounts, and ReportFlow takes care of the rest."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link href={hasClients ? "/dashboard/clients" : "/dashboard/clients/new"}>
                  {hasClients ? <><PlugZap size={16} /> Connect an integration</> : <><Users size={16} /> Add your first client</>}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/integrations">Browse integrations</Link>
              </Button>
            </div>
          </div>
          <div className="w-full border-t border-slate-100 pt-5 sm:w-64 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <SetupProgress steps={steps} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Shown when integrations exist but no metrics have landed yet — the first
// sync is queued or still running. Distinct from "nothing connected" so users
// aren't told to reconnect something that is already working.
export function AwaitingSyncState({ sourceCount, failing }: { sourceCount: number; failing: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100">
            <RefreshCw size={20} />
          </div>
          <div>
            <p className="font-semibold text-ink-900">
              {failing > 0 ? "Waiting on your first successful sync" : "Your first sync is on the way"}
            </p>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-500">
              {failing > 0 ? (
                <>
                  {failing} of your {sourceCount} connected source{sourceCount === 1 ? "" : "s"} hit an error while
                  syncing. Check the details and reconnect if needed — performance data appears here as soon as one
                  sync succeeds.
                </>
              ) : (
                <>
                  {sourceCount} source{sourceCount === 1 ? " is" : "s are"} connected. Metrics usually land within a few
                  minutes of connecting, and refresh automatically after that. Nothing is shown here until real data
                  arrives.
                </>
              )}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="flex-shrink-0">
          <Link href={failing > 0 ? "/dashboard/settings/health" : "/dashboard/clients"}>
            {failing > 0 ? "Check integration health" : "View clients"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// Compact inline placeholder for an individual panel (top clients, a chart,
// an insights list) that has no data yet.
export function NoDataYet({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
      <p className="max-w-xs text-sm text-ink-500">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

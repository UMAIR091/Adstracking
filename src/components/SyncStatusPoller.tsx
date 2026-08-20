"use client";

// Live initial-sync experience (journey audit P0-3). Shown right after a source
// is connected but before its data has landed. Instead of a static "please
// wait," it polls real status, shows the current stage, auto-refreshes the page
// the moment data arrives (revealing the analytics), and surfaces failures with
// a recovery path. The user always knows what's happening.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Status = { anyReady: boolean; anySyncing: boolean; anyError: boolean; sources: { name: string; status: string; error: string | null }[] };

const STAGES = ["Connection secured", "Fetching your metrics", "Building your dashboard"];

export function SyncStatusPoller({ clientId, sourceCount, initialFailing }: { clientId: string; sourceCount: number; initialFailing: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    let alive = true;
    const started = Date.now();

    async function poll() {
      try {
        const res = await fetch(`/api/clients/${clientId}/sync-status`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const data: Status = await res.json();
        if (!alive) return;
        setStatus(data);
        if (data.anyReady && !done.current) {
          done.current = true;
          toast.success("Your data is ready 🎉");
          router.refresh(); // reveals the real analytics + report generation
        }
      } catch {
        /* transient — keep polling */
      }
    }

    poll();
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - started) / 1000));
      // Stop after ~4 minutes to avoid endless polling; the manual refresh still works.
      if (done.current || Date.now() - started > 240_000) { clearInterval(id); return; }
      poll();
    }, 4000);

    return () => { alive = false; clearInterval(id); };
  }, [clientId, router]);

  const failing = status ? status.sources.filter((s) => s.status === "error").length : initialFailing;
  const hasError = failing > 0;

  if (hasError) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-danger-50 text-danger-600 ring-1 ring-inset ring-danger-100">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="font-semibold text-ink-900">A source needs attention</p>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-500">
                {failing} of your {sourceCount} connected source{sourceCount === 1 ? "" : "s"} hit an error while syncing.
                Reconnect it and data will appear here automatically.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="flex-shrink-0">
            <Link href="/dashboard/settings/health">Check integration health</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Current stage: 0 secured, 1 fetching (default while syncing), 2 building.
  const stageIndex = elapsed > 8 ? 2 : 1;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
            <Loader2 size={20} className="animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink-900">Setting up your data…</p>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-500">
              {sourceCount} source{sourceCount === 1 ? " is" : "s are"} syncing. This usually takes under a minute — you can
              stay here or leave; it keeps running in the background and updates automatically when ready.
            </p>

            <ul className="mt-4 space-y-2">
              {STAGES.map((label, i) => {
                const state = i < stageIndex ? "done" : i === stageIndex ? "active" : "todo";
                return (
                  <li key={label} className="flex items-center gap-2.5 text-sm">
                    {state === "done" ? (
                      <CheckCircle2 size={16} className="text-success-500" />
                    ) : state === "active" ? (
                      <Loader2 size={16} className="animate-spin text-brand-500" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border-2 border-ink-200" />
                    )}
                    <span className={state === "todo" ? "text-ink-400" : "text-ink-700"}>{label}</span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => router.refresh()}>
                <RefreshCw size={14} /> Check now
              </Button>
              <span className="text-xs text-ink-400">Auto-refreshing…</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

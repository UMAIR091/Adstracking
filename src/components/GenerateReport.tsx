"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileBarChart2, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { track, ANALYTICS } from "@/lib/analytics";

const TEMPLATES = [
  { key: "seo", name: "SEO Report" },
  { key: "marketing", name: "Marketing Performance" },
  { key: "executive", name: "Executive Summary" },
];

// Generation is a single server call, so there is no real progress to stream.
// These stages describe what that call actually does, in order, at roughly the
// pace it does it — honest narration of a known sequence, not a fake progress
// bar that fills to 90% and waits. The final stage stays until the request
// returns, so the UI never claims to have finished before the server has.
const STAGES = [
  { label: "Reading your synced data", ms: 900 },
  { label: "Comparing against the previous period", ms: 1400 },
  { label: "Writing AI insights", ms: 4000 },
  { label: "Building your report", ms: 0 },
];

export function GenerateReport({ clientId, ready }: { clientId: string; ready: boolean }) {
  const router = useRouter();
  const [template, setTemplate] = useState("seo");
  const [period, setPeriod] = useState(28);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear pending stage timers on unmount so a navigation mid-generation can't
  // set state on a component that no longer exists.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function startStages() {
    setStage(0);
    let elapsed = 0;
    timers.current = STAGES.slice(0, -1).map((s, i) => {
      elapsed += s.ms;
      return setTimeout(() => setStage(i + 1), elapsed);
    });
  }

  function stopStages() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  async function generate() {
    setBusy(true);
    startStages();
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, templateKey: template, periodDays: period }),
      });
      const data = await res.json();
      if (!res.ok) {
        stopStages();
        setBusy(false);
        return toast.error(data.error ?? "Failed to generate report");
      }
      stopStages();
      toast.success("Report ready", { description: "Opening it now — you can share or download it from there." });
      track(ANALYTICS.reportGenerated, { template });
      router.push(`/dashboard/reports/${data.id}`);
    } catch {
      stopStages();
      setBusy(false);
      toast.error("Couldn't reach the server. Please try again.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileBarChart2 size={16} className="text-brand-500" aria-hidden /> Generate a report</CardTitle>
        <CardDescription>Build a branded, shareable report from your latest synced data — with an AI-written executive summary.</CardDescription>
      </CardHeader>
      <CardContent>
        {!ready ? (
          <p className="text-sm text-ink-500">Connect a data source above to generate reports.</p>
        ) : busy ? (
          // Progress replaces the form rather than sitting beside it: the
          // controls are inert during generation, and leaving them visible but
          // dead invites clicking them again.
          <div aria-live="polite">
            <ol className="space-y-2.5">
              {STAGES.map((s, i) => {
                const done = i < stage;
                const active = i === stage;
                return (
                  <li key={s.label} className="flex items-center gap-2.5">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        done ? "bg-emerald-50 text-emerald-600" : active ? "bg-brand-50 text-brand-600" : "bg-surface-muted text-ink-300"
                      }`}
                    >
                      {done ? <Check size={13} aria-hidden /> : active ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
                    </span>
                    <span className={`text-sm ${done ? "text-ink-500" : active ? "font-medium text-ink-900" : "text-ink-400"}`}>
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-500">
              <Sparkles size={12} className="text-brand-500" aria-hidden />
              This usually takes 5–15 seconds. You can leave this page — the report is saved either way.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="gen-template" className="mb-1 block text-xs font-medium text-ink-700">Template</label>
              <select
                id="gen-template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="h-10 rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="gen-period" className="mb-1 block text-xs font-medium text-ink-700">Date range</label>
              <select
                id="gen-period"
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value))}
                className="h-10 rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                <option value={28}>Last 28 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
            <Button onClick={generate}>Generate report</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

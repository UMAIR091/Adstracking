"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileBarChart2, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { track, ANALYTICS } from "@/lib/analytics";

// `name` mirrors report_templates.name for the system templates seeded in
// migration 0001 — generation titles the report "{client} — {template name}",
// so these are the strings the review line can honestly promise. The menu
// label is kept shorter than the full report name for the dropdown.
const TEMPLATES = [
  { key: "seo", label: "SEO Report", name: "SEO Report" },
  { key: "marketing", label: "Marketing Performance", name: "Marketing Performance Report" },
  { key: "executive", label: "Executive Summary", name: "Executive Summary Report" },
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

export function GenerateReport({
  clientId,
  clientName,
  ready,
  blockedReason,
}: {
  clientId: string;
  /** Named in the review line, so it's clear who the report is for. */
  clientName?: string;
  /** A synced snapshot exists — generation reads cached data, not live APIs. */
  ready: boolean;
  /** Which setup step is missing, so the message names a next action. */
  blockedReason?: string;
}) {
  const router = useRouter();
  const [template, setTemplate] = useState("seo");
  const [period, setPeriod] = useState(28);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const selected = TEMPLATES.find((t) => t.key === template) ?? TEMPLATES[0];

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
          <p className="text-sm text-ink-500">
            {blockedReason ?? "Connect a data source above to generate reports."}
          </p>
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
          // Configure, then review, then generate. The two steps were already
          // here as a bare row of controls; labelling them — and stating what
          // the run will actually produce before you commit to it — is what
          // makes the sequence readable.
          <div className="space-y-4">
            <div>
              <StepLabel n={1}>Configure</StepLabel>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="gen-template" className="mb-1 block text-xs font-medium text-ink-700">Template</label>
                  <select
                    id="gen-template"
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className="h-10 rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  >
                    {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
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
              </div>
            </div>

            <div>
              <StepLabel n={2}>Review &amp; generate</StepLabel>
              <div className="mt-2 rounded-xl border border-ink-100 bg-surface-muted/40 p-4">
                <dl className="space-y-1.5 text-sm">
                  <Row label="Report">
                    {clientName ? `${clientName} — ${selected.name}` : selected.name}
                  </Row>
                  <Row label="Period">Last {period} days of synced data</Row>
                  <Row label="Branding">Your saved logo, colour and footer</Row>
                </dl>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={generate}>Generate report</Button>
                  <Link href="/dashboard/reports/preview" className="text-sm font-medium text-brand-600 hover:underline">
                    See a sample first
                  </Link>
                </div>
                <p className="mt-3 text-xs text-ink-500">
                  Saved to Reports — you can email it to the client or put it on a schedule afterwards.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-muted text-[10px] font-bold text-ink-600">{n}</span>
      {children}
    </p>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="w-20 shrink-0 text-ink-500">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium text-ink-800">{children}</dd>
    </div>
  );
}

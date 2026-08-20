"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileBarChart2, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { track, ANALYTICS } from "@/lib/analytics";
import { periodLabel } from "@/lib/report";
import { PERIOD_PRESETS, resolvePeriod, latestSettledDay, type PeriodPreset } from "@/lib/reports/periods";
import { REPORT_TYPES, inferReportType, suggestReportTitle, type ReportType } from "@/lib/reports/types";

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
  sources = [],
  ready,
  blockedReason,
}: {
  clientId: string;
  /** Named in the review line, so it's clear who the report is for. */
  clientName?: string;
  /** Sources that will feed the report — shown, and used to infer the type. */
  sources?: { id: string; name: string }[];
  /** A synced snapshot exists — generation reads cached data, not live APIs. */
  ready: boolean;
  /** Which setup step is missing, so the message names a next action. */
  blockedReason?: string;
}) {
  const router = useRouter();
  const [template, setTemplate] = useState("seo");
  const [preset, setPreset] = useState<PeriodPreset>("last_28");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const selected = TEMPLATES.find((t) => t.key === template) ?? TEMPLATES[0];
  // Resolved with the SAME function the server uses, so what the review step
  // promises is exactly the window the report is generated and stored with.
  // An unusable custom range surfaces its error here rather than after a
  // round-trip.
  const resolved = resolvePeriod({ preset, customStart, customEnd });
  const plannedPeriod = resolved.ok ? resolved : null;
  const periodError = resolved.ok ? null : resolved.error;
  const plannedLabel = resolved.ok
    ? (resolved.period.kind === "calendar" ? resolved.period.label : periodLabel(resolved.period.start, resolved.period.end))
    : null;
  const maxDate = latestSettledDay();

  // The type defaults to whatever the connected sources imply and stays
  // overridable; the title follows it until the user takes control.
  //
  // This default is a PREVIEW. It is inferred from the sources that have a
  // snapshot, which is not the same question as which sources will contribute
  // data to the period being generated — a source can be connected and synced
  // and still have nothing in this window. Only a type the user actually picked
  // is sent; otherwise the server infers from what really contributed.
  const [type, setType] = useState<ReportType>(() => inferReportType(sources.map((s) => s.id)));
  const [typeEdited, setTypeEdited] = useState(false);
  const suggestedTitle = suggestReportTitle({
    clientName: clientName ?? "Client",
    type,
    periodLabel: plannedLabel,
  });
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const shownTitle = titleEdited ? title : suggestedTitle;
  useEffect(() => {
    if (!titleEdited) setTitle(suggestedTitle);
  }, [suggestedTitle, titleEdited]);

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
        body: JSON.stringify({
          clientId,
          templateKey: template,
          period: preset,
          customStart: customStart || undefined,
          customEnd: customEnd || undefined,
          // Only what the user chose. An untouched control is a suggestion,
          // and sending it would override the server's inference with a guess
          // made before the data was read.
          reportType: typeEdited ? type : undefined,
          title: titleEdited && title.trim() ? title.trim() : undefined,
        }),
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
                        done ? "bg-success-50 text-success-600" : active ? "bg-brand-50 text-brand-600" : "bg-surface-muted text-ink-300"
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
          // Configure, then generate — with the button and the window it will
          // actually use always in view. The controls are the same ones, and
          // the review still states the resolved period before you commit; what
          // went was the numbered step scaffolding around them, which pushed the
          // primary action below the fold on the page whose job is to run it.
          <div className="space-y-4">
            {/* Which sources this report will be built from — without this,
                "SEO Report" on an ads-only client is the first hint anything is
                off. */}
            {sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="text-xs font-medium text-ink-500">Built from</span>
                {sources.map((s) => (
                  <span key={s.id} className="inline-flex items-center rounded-full border border-ink-200 bg-surface-muted/60 px-2.5 py-1 text-xs font-medium text-ink-700">
                    {s.name}
                  </span>
                ))}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="gen-type" className="mb-1 block text-xs font-medium text-ink-700">Report type</label>
                  <select
                    id="gen-type"
                    value={type}
                    onChange={(e) => { setType(e.target.value as ReportType); setTypeEdited(true); }}
                    className="field h-10"
                  >
                    {REPORT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="gen-template" className="mb-1 block text-xs font-medium text-ink-700">Template</label>
                  <select
                    id="gen-template"
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className="field h-10"
                  >
                    {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="gen-period" className="mb-1 block text-xs font-medium text-ink-700">Reporting period</label>
                  {/* Rolling and calendar windows are grouped, because they are
                      genuinely different things — "Last 30 days" is not August. */}
                  <select
                    id="gen-period"
                    value={preset}
                    onChange={(e) => setPreset(e.target.value as PeriodPreset)}
                    className="field h-10"
                  >
                    <optgroup label="Rolling">
                      {PERIOD_PRESETS.filter((p) => p.kind === "rolling").map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Calendar">
                      {PERIOD_PRESETS.filter((p) => p.kind === "calendar").map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Custom">
                      <option value="custom">Custom range</option>
                    </optgroup>
                  </select>
                </div>
                {preset === "custom" && (
                  <>
                    <div>
                      <label htmlFor="gen-from" className="mb-1 block text-xs font-medium text-ink-700">From</label>
                      <input
                        id="gen-from" type="date" value={customStart} max={maxDate}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="field h-10"
                      />
                    </div>
                    <div>
                      <label htmlFor="gen-to" className="mb-1 block text-xs font-medium text-ink-700">To</label>
                      <input
                        id="gen-to" type="date" value={customEnd} max={maxDate}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="field h-10"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="gen-title" className="mb-1 block text-xs font-medium text-ink-700">Title</label>
              {/* Suggested from client + type + period, and rewritten as those
                  change — until the user edits it, after which their text is
                  left alone. Sent to the API; blank falls back to the same
                  suggestion server-side. */}
              <input
                id="gen-title"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }}
                placeholder={suggestedTitle}
                aria-label="Report title"
                className="field mt-2 h-10 w-full"
              />
              {titleEdited && title.trim() !== suggestedTitle && (
                <button
                  type="button"
                  onClick={() => { setTitle(suggestedTitle); setTitleEdited(false); }}
                  className="mt-1.5 text-xs font-medium text-brand-600 hover:underline"
                >
                  Reset to suggested title
                </button>
              )}
            </div>

            {/* The action, and the one fact the controls above don't already
                show: the exact window generation will use, resolved by the same
                function the server calls rather than a restatement of it.
                Title and type aren't repeated here — they're in view directly
                above, and a summary that echoes its own inputs is just more to
                read. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-ink-100 pt-4">
              <div className="min-w-0 flex-1 text-xs leading-relaxed text-ink-500">
                {plannedPeriod ? (
                  <>
                    <span className="font-medium text-ink-700">
                      {plannedPeriod.period.label} · {plannedPeriod.period.start} to {plannedPeriod.period.end}
                    </span>{" "}
                    ({plannedPeriod.period.days} {plannedPeriod.period.days === 1 ? "day" : "days"}
                    {plannedPeriod.period.kind === "calendar" ? ", calendar" : plannedPeriod.period.kind === "rolling" ? ", rolling" : ""}
                    {plannedPeriod.period.inProgress ? ", still in progress" : ""}) · your saved branding · saved to
                    Reports
                  </>
                ) : (
                  <span className="text-warning-700">{periodError}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Link href="/dashboard/reports/preview" className="text-sm font-medium text-brand-600 hover:underline">
                  See a sample
                </Link>
                <Button onClick={generate} disabled={!plannedPeriod}>Generate report</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { BrandLoader } from "@/components/Brand";
import { SendReport } from "@/components/SendReport";
import { DownloadPdf } from "@/components/DownloadPdf";
import { track, ANALYTICS } from "@/lib/analytics";
import { periodLabel } from "@/lib/report";
import { PERIOD_PRESETS, resolvePeriod, previousWindow, latestSettledDay, type PeriodPreset } from "@/lib/reports/periods";
import { REPORT_TYPES, inferReportType, suggestReportTitle, type ReportType } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

// "New report": the one generate flow, opened from Home, the Reports page and
// a client's header (window event `open-generate`, optionally with a client).
// Mounted once in the dashboard layout, so a report keeps building after the
// dialog is closed and a toast says when it's ready.
//
// It sends exactly what the old in-page form sent to /api/reports/generate:
// client, template, period (+ custom dates), and a report type or title only
// when the user set one. Everything else is decided server-side as before.

export type GenSource = { type: string; name: string; note: string | null };
export type GenClient = {
  id: string;
  name: string;
  email: string | null;
  /** A source has synced data, so a report can be built now. */
  ready: boolean;
  sources: GenSource[];
};

// `name` mirrors report_templates.name (migration 0001): generation titles
// the report "{client} — {template name}". Descriptions are the seeded ones.
const TEMPLATES = [
  { key: "seo", label: "SEO Report", name: "SEO Report", description: "Search Console + GA4 organic performance" },
  { key: "marketing", label: "Marketing Performance", name: "Marketing Performance Report", description: "Full-funnel overview" },
  { key: "executive", label: "Executive Summary", name: "Executive Summary Report", description: "One-page high-level KPIs" },
];

// Generation is one server call with no progress events. These lines narrate
// what it does, in order, at roughly its pace; the last stays until the
// response arrives, so the dialog never claims to finish before the server.
const STAGES = [
  { label: "Pulling the latest data", ms: 1500 },
  { label: "Writing AI insights", ms: 4500 },
  { label: "Building the branded report", ms: 0 },
];

// "17 Sep – 14 Oct 2026": exact days, read straight from the YYYY-MM-DD
// strings so no time zone can shift them.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function days(start: string, end: string): string {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const a = `${ds} ${MONTHS[ms - 1]}${ys !== ye ? ` ${ys}` : ""}`;
  return start === end ? `${a} ${ye}` : `${a} – ${de} ${MONTHS[me - 1]} ${ye}`;
}

const QUICK: { value: string; label: string }[] = [
  { value: "previous_month", label: "Last month" },
  { value: "last_28", label: "Last 28 days" },
  { value: "other", label: "Other" },
];

type Phase = { step: "form" } | { step: "busy" } | { step: "done"; reportId: string; title: string };

export function openGenerateDialog(clientId?: string) {
  window.dispatchEvent(new CustomEvent("open-generate", { detail: { clientId } }));
}

/** Primary "New report" / "Generate report" trigger. */
export function NewReportButton({
  clientId,
  children,
  ...props
}: { clientId?: string; children: React.ReactNode } & Omit<ButtonProps, "onClick">) {
  return (
    <Button type="button" onClick={() => openGenerateDialog(clientId)} {...props}>
      {children}
    </Button>
  );
}

export function GenerateReportDialog({ clients }: { clients: GenClient[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ step: "form" });
  const [clientId, setClientId] = useState<string | null>(null);
  const [template, setTemplate] = useState("seo");
  const [quick, setQuick] = useState("last_28");
  const [preset, setPreset] = useState<PeriodPreset>("last_28");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [type, setType] = useState<ReportType | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);
  openRef.current = open;

  const readyClients = useMemo(() => clients.filter((c) => c.ready), [clients]);
  const client = clients.find((c) => c.id === clientId) ?? null;
  const tpl = TEMPLATES.find((t) => t.key === template) ?? TEMPLATES[0];

  // Resolved with the same function the server uses, so the note states the
  // window the report will actually cover.
  const resolved = resolvePeriod({ preset, customStart, customEnd });
  const planned = resolved.ok ? resolved.period : null;
  const plannedLabel = planned ? (planned.kind === "calendar" ? planned.label : periodLabel(planned.start, planned.end)) : null;
  const note = useMemo(() => {
    if (!planned) return resolved.ok ? "" : resolved.error;
    const prev = previousWindow(planned);
    const length = `${planned.days} day${planned.days === 1 ? "" : "s"}${planned.inProgress ? ", still in progress" : ""}`;
    const what = planned.kind === "calendar" ? `${planned.label}: ${days(planned.start, planned.end)}` : days(planned.start, planned.end);
    return `${what} (${length}), compared with ${days(prev.start, prev.end)}.`;
  }, [planned, resolved]);

  const inferredType = inferReportType((client?.sources ?? []).map((s) => s.type));
  const shownType = type ?? inferredType;
  const suggestedTitle = suggestReportTitle({ clientName: client?.name ?? "Client", type: shownType, periodLabel: plannedLabel });

  // ── open / close ─────────────────────────────────────────────
  useEffect(() => {
    const onOpen = (e: Event) => {
      const wanted = (e as CustomEvent<{ clientId?: string }>).detail?.clientId;
      returnFocus.current = document.activeElement as HTMLElement | null;
      setOpen(true);
      setPhase((p) => (p.step === "busy" ? p : { step: "form" }));
      setError(null);
      setClientId((cur) => {
        const pick = wanted ?? cur;
        if (pick && clients.some((c) => c.id === pick && c.ready)) return pick;
        // Default to a client whose sources are all healthy, so the dialog
        // doesn't open on one whose data may be out of date.
        return (readyClients.find((c) => c.sources.every((src) => !src.note)) ?? readyClients[0])?.id ?? null;
      });
      if (wanted) { setType(null); setTitle(""); }
    };
    window.addEventListener("open-generate", onOpen);
    return () => window.removeEventListener("open-generate", onOpen);
  }, [clients, readyClients]);

  const close = useCallback(() => {
    setOpen(false);
    returnFocus.current?.focus?.();
  }, []);

  // Esc closes; Tab stays inside the dialog.
  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      panel.current?.querySelector<HTMLElement>("button, a, input, select");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(
        panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex="0"]')
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const firstEl = items[0], lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, phase.step, close]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // ── generate ─────────────────────────────────────────────────
  async function generate() {
    if (!client || !planned) return;
    setError(null);
    setPhase({ step: "busy" });
    setStage(0);
    let elapsed = 0;
    timers.current = STAGES.slice(0, -1).map((s, i) => {
      elapsed += s.ms;
      return setTimeout(() => setStage(i + 1), elapsed);
    });
    const stop = () => { timers.current.forEach(clearTimeout); timers.current = []; };
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          templateKey: template,
          period: preset,
          customStart: customStart || undefined,
          customEnd: customEnd || undefined,
          reportType: type ?? undefined,
          title: title.trim() ? title.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      stop();
      if (!res.ok) {
        const msg = data.error ?? "Failed to generate report";
        setError(msg);
        setPhase({ step: "form" });
        if (!openRef.current) toast.error(msg);
        return;
      }
      track(ANALYTICS.reportGenerated, { template });
      router.refresh();
      setPhase({ step: "done", reportId: data.id, title: data.title ?? `${client.name} — ${tpl.name}` });
      // Closed while it was building: say so where the user is now.
      if (!openRef.current) {
        toast.success("Report ready", {
          description: `${client.name} · ${tpl.label}`,
          action: { label: "Open", onClick: () => router.push(`/dashboard/reports/${data.id}`) },
        });
      }
    } catch {
      stop();
      setError("Couldn't reach the server. Please try again.");
      setPhase({ step: "form" });
    }
  }

  if (!open) return null;

  const labelId = "generate-dialog-title";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="max-h-[calc(100vh-32px)] w-full max-w-[520px] overflow-auto rounded-dialog bg-surface text-ink-900 shadow-[0_30px_80px_-20px_rgb(18_23_28_/_0.5)]"
      >
        {phase.step === "form" && (
          <>
            <div className="flex items-center justify-between border-b border-ink-100 px-[22px] py-5">
              <h2 id={labelId} className="text-[17px] font-semibold">New report</h2>
              <button type="button" onClick={close} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-[18px] px-[22px] py-5">
              {error && (
                <div role="alert" className="rounded-control bg-danger-50 px-3.5 py-2.5 text-[13.5px] text-danger-700">
                  {error}
                </div>
              )}

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[13px] font-medium">Client</legend>
                {readyClients.length === 0 ? (
                  <p className="text-[13.5px] leading-relaxed text-ink-500">
                    No client has synced data yet. Connect a data source to a client, and once its first sync lands you
                    can generate a report here.{" "}
                    <Link href="/dashboard/clients" onClick={close} className="font-medium text-brand-600 hover:text-ink-900">Go to clients →</Link>
                  </p>
                ) : (
                  <div role="radiogroup" aria-label="Client" className="flex flex-wrap gap-1.5">
                    {readyClients.map((c) => {
                      const on = c.id === clientId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => { setClientId(c.id); setType(null); }}
                          {...(on ? { "data-autofocus": true } : {})}
                          className={cn(
                            "flex items-center gap-[7px] rounded-[9px] border px-[11px] py-[7px] text-[13px] transition-colors",
                            on ? "border-ink-900 bg-ink-50 font-semibold" : "border-ink-200 bg-surface font-medium hover:border-ink-300"
                          )}
                        >
                          <span aria-hidden className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-ink-900 text-[10px] font-bold text-surface">
                            {c.name.charAt(0).toUpperCase()}
                          </span>
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-[13px] font-medium">Template</legend>
                <div role="radiogroup" aria-label="Template" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {TEMPLATES.map((t) => {
                    const on = t.key === template;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setTemplate(t.key)}
                        className={cn(
                          "rounded-[11px] border p-3 text-left transition-colors",
                          on ? "border-ink-900 bg-ink-50" : "border-ink-200 bg-surface hover:border-ink-300"
                        )}
                      >
                        <span className="block text-[13.5px] font-semibold">{t.label}</span>
                        <span className="mt-[3px] block text-xs leading-snug text-ink-500">{t.description}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex flex-col gap-2">
                <span id="gen-period-label" className="text-[13px] font-medium">Period</span>
                <Segmented
                  label="Period"
                  options={QUICK}
                  value={quick}
                  onChange={(v) => {
                    setQuick(v);
                    if (v !== "other") setPreset(v as PeriodPreset);
                  }}
                  className="self-start"
                />
                {quick === "other" && (
                  <div className="flex flex-wrap items-end gap-2">
                    <select
                      aria-label="Reporting period"
                      value={preset}
                      onChange={(e) => setPreset(e.target.value as PeriodPreset)}
                      className="field h-10"
                    >
                      {PERIOD_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    {preset === "custom" && (
                      <>
                        <input aria-label="From" type="date" value={customStart} max={latestSettledDay()} onChange={(e) => setCustomStart(e.target.value)} className="field h-10" />
                        <input aria-label="To" type="date" value={customEnd} max={latestSettledDay()} onChange={(e) => setCustomEnd(e.target.value)} className="field h-10" />
                      </>
                    )}
                  </div>
                )}
                <span className={cn("text-[12.5px]", planned ? "text-ink-400" : "text-warning-700")}>{note}</span>
              </div>

              {client && (
                <div className="flex flex-col gap-1.5 rounded-[11px] bg-canvas px-3.5 py-3">
                  <span className="text-xs text-ink-400">Data included</span>
                  <span className="text-[13.5px]">
                    {client.sources.map((s, i) => (
                      <span key={`${s.type}-${i}`}>
                        {i > 0 && " · "}
                        {s.name}
                        {s.note && <span className="text-warning-700"> ({s.note})</span>}
                      </span>
                    ))}
                  </span>
                </div>
              )}

              <details className="group text-[13px]">
                <summary className="cursor-pointer font-medium text-ink-500 hover:text-ink-900">Title and report type</summary>
                <div className="mt-3 flex flex-col gap-3">
                  <label className="flex flex-col gap-1.5 font-medium">
                    Report type
                    <select
                      value={shownType}
                      onChange={(e) => setType(e.target.value as ReportType)}
                      className="field h-10 font-normal"
                    >
                      {REPORT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 font-medium">
                    Title
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={suggestedTitle}
                      className="field h-10 font-normal"
                    />
                  </label>
                </div>
              </details>
            </div>

            <div className="flex justify-end gap-2 border-t border-ink-100 px-[22px] py-4">
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
              <Button type="button" onClick={generate} disabled={!client || !planned}>Generate report</Button>
            </div>
          </>
        )}

        {phase.step === "busy" && (
          <div aria-live="polite" className="flex flex-col items-center gap-1.5 px-7 py-11 text-center">
            <BrandLoader className="h-16 w-16" label="Building report" />
            <h2 id={labelId} className="mt-3.5 text-lg font-semibold">{client ? `Building ${client.name}'s report` : "Building the report"}</h2>
            <p className="text-[13.5px] text-ink-500">
              This usually takes under a minute. You can close this — we&apos;ll let you know when it&apos;s ready.
            </p>
            <ol className="mx-auto mt-[18px] flex w-full max-w-[300px] flex-col gap-2 text-left">
              {STAGES.map((s, i) => {
                const done = i < stage;
                const cur = i === stage;
                return (
                  <li key={s.label} className={cn("flex items-center gap-2.5 text-[13.5px]", done || cur ? "text-ink-900" : "text-ink-subtle")}>
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-[18px] w-[18px] items-center justify-center rounded-full text-white",
                        done ? "bg-brand-500" : cur ? "animate-pulse bg-brand-50" : "bg-ink-100"
                      )}
                    >
                      {done && <Check size={11} strokeWidth={3} />}
                    </span>
                    {s.label}
                    {done && <span className="sr-only"> (done)</span>}
                  </li>
                );
              })}
            </ol>
            <button type="button" onClick={close} className="mt-4 text-[13px] text-ink-400 hover:text-ink-900">Close</button>
          </div>
        )}

        {phase.step === "done" && (
          <div className="px-7 pb-6 pt-8 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-700">
              <Check size={22} strokeWidth={2.4} aria-hidden />
            </span>
            <h2 id={labelId} className="mt-3.5 text-lg font-semibold">Report ready</h2>
            <p className="mt-1.5 text-[13.5px] text-ink-500">
              {client?.name} · {tpl.label}{plannedLabel ? ` · ${plannedLabel}` : ""}
            </p>
            <div className="mt-[22px] flex flex-col gap-2">
              <Button asChild size="lg" className="w-full">
                <Link href={`/dashboard/reports/${phase.reportId}`} onClick={close} data-autofocus>Review report</Link>
              </Button>
              <div className="flex gap-2 [&>*]:flex-1">
                <SendReport reportId={phase.reportId} clientEmail={client?.email ?? null} variant="outline" />
                <DownloadPdf href={`/api/reports/${phase.reportId}/pdf`} filename={`${phase.title}.pdf`} />
              </div>
              <button type="button" onClick={() => { setPhase({ step: "form" }); close(); }} className="mt-1.5 text-[13px] text-ink-400 hover:text-ink-900">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

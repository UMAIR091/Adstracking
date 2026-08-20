"use client";

// Incident / outage banner (launch audit P1-8). Driven by env so you can post a
// customer-facing message during an incident or planned maintenance window:
//   NEXT_PUBLIC_INCIDENT_MESSAGE="We're investigating slow report delivery."
//   NEXT_PUBLIC_INCIDENT_LEVEL="warning"        (info | warning | critical)
//   NEXT_PUBLIC_INCIDENT_URL="https://status.…" (optional link)
// Renders nothing when unset. Dismissible per session. (Can later be swapped to
// a DB/status-page source without changing call sites.)
import { useEffect, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";

const STYLES = {
  info: { bg: "bg-info-50 border-info-200 text-info-800", Icon: Info },
  warning: { bg: "bg-warning-50 border-warning-200 text-warning-900", Icon: AlertTriangle },
  critical: { bg: "bg-danger-50 border-danger-200 text-danger-800", Icon: AlertTriangle },
} as const;

export function IncidentBanner() {
  const message = process.env.NEXT_PUBLIC_INCIDENT_MESSAGE;
  const level = (process.env.NEXT_PUBLIC_INCIDENT_LEVEL as keyof typeof STYLES) || "warning";
  const url = process.env.NEXT_PUBLIC_INCIDENT_URL;
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissal when the message changes (new incident).
  useEffect(() => setDismissed(false), [message]);

  if (!message || dismissed) return null;
  const style = STYLES[level] ?? STYLES.warning;

  return (
    <div className={`no-print border-b ${style.bg}`} role="status">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm">
        <style.Icon size={16} className="flex-shrink-0" />
        <p className="flex-1">
          {message}
          {url && <> <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium underline">Status page</a></>}
        </p>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="rounded p-1 hover:bg-overlay/5"><X size={15} /></button>
      </div>
    </div>
  );
}

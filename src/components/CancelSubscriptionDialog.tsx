"use client";

// Respectful cancellation flow (journey audit P2-8): explains exactly what
// happens, offers to keep/resume, and captures a reason so churn is learnable —
// without dark patterns. Access always continues to period end.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

const REASONS = [
  "Too expensive",
  "Missing a feature I need",
  "Not using it enough",
  "Switching to another tool",
  "Just taking a break",
  "Other",
];

export function CancelSubscriptionDialog({
  open,
  endsAtLabel,
  busy,
  onKeep,
  onConfirm,
}: {
  open: boolean;
  endsAtLabel: string | null;
  busy: boolean;
  onKeep: () => void;
  onConfirm: (reason: string, comment: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [mounted, setMounted] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !busy) onKeep(); }
    document.addEventListener("keydown", onKey);
    firstRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onKeep]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onKeep(); }}>
      <div className="absolute inset-0 bg-ink-900/40 animate-fade-in" aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-surface p-6 shadow-xl">
        <h2 id="cancel-title" className="text-lg font-semibold text-ink-900">Before you go</h2>

        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-ink-600">
          <CalendarClock size={16} className="mt-0.5 flex-shrink-0 text-ink-400" />
          <span>
            You&apos;ll keep full access{endsAtLabel ? <> until <span className="font-medium text-ink-800">{endsAtLabel}</span></> : " until the end of your current billing period"} — your
            clients, reports and schedules stay live until then, and you can resume anytime before it ends. You won&apos;t be charged again.
          </span>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-ink-700">Mind sharing why? <span className="font-normal text-ink-400">(optional)</span></p>
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${reason === r ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-ink-600 hover:bg-slate-50"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything else you'd like us to know?"
            rows={2}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="destructive" onClick={() => onConfirm(reason, comment)} disabled={busy}>
            {busy ? "Cancelling…" : "Cancel subscription"}
          </Button>
          <Button ref={firstRef} onClick={onKeep} disabled={busy}>
            <Heart size={15} /> Keep my subscription
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

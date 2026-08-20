"use client";

// Floating in-app support widget (launch audit P2-9): send feedback, report a
// bug, or request a feature — plus a link to full support. Lightweight and
// self-contained; posts to /api/feedback.
import { useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquarePlus, X, Bug, Lightbulb, MessageCircle, LifeBuoy, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { track, ANALYTICS } from "@/lib/analytics";

type Kind = "feedback" | "bug" | "feature";
const KINDS: { id: Kind; label: string; icon: typeof Bug }[] = [
  { id: "feedback", label: "Feedback", icon: MessageCircle },
  { id: "bug", label: "Bug", icon: Bug },
  { id: "feature", label: "Idea", icon: Lightbulb },
];

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("feedback");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (message.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: kind, message: message.trim(), url: window.location.pathname }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error ?? "Couldn't submit");
      }
      track(ANALYTICS.feedbackSubmitted, { type: kind });
      setDone(true);
      setMessage("");
      setTimeout(() => { setOpen(false); setDone(false); }, 1600);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Send feedback"
        className="no-print fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-solid text-white shadow-lg transition-transform hover:scale-105 hover:bg-brand-solid-hover focus-ring"
      >
        <MessageSquarePlus size={20} />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="no-print fixed bottom-20 right-5 z-50 w-[min(360px,calc(100vw-2.5rem))] rounded-2xl border border-ink-200 bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">How can we help?</p>
            <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"><X size={16} /></button>
          </div>

          {done ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <CheckCircle2 size={28} className="text-success-500" />
              <p className="text-sm font-medium text-ink-900">Thanks — we got it!</p>
              <p className="text-xs text-ink-500">We read every message.</p>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-1.5">
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => setKind(k.id)}
                    className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-xs transition-colors ${kind === k.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`}
                  >
                    <k.icon size={16} /> {k.label}
                  </button>
                ))}
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                autoFocus
                placeholder={kind === "bug" ? "What happened, and what did you expect?" : kind === "feature" ? "What would you love ReportFlow to do?" : "Tell us what's on your mind…"}
                className="field w-full resize-none py-2"
              />
              <div className="flex items-center justify-between">
                <Link href="/help" className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700">
                  <LifeBuoy size={13} /> Help Center
                </Link>
                <Button size="sm" onClick={submit} disabled={busy || message.trim().length < 3}>
                  {busy ? <><Loader2 size={14} className="animate-spin" /> Sending</> : "Send"}
                </Button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

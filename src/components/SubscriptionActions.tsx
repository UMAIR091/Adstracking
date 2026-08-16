"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CancelSubscriptionDialog } from "@/components/CancelSubscriptionDialog";

// Manage-billing / cancel / resume controls for an active Paddle subscription.
// Cancellation is always end-of-period, so the copy promises exactly that.
//
// Cancel stays available during a payment issue — someone whose card is failing
// may well want to cancel, and hiding it would trap them. Hierarchy is handled
// on the page instead: the recovery banner owns the only filled button, while
// this stays a ghost control.
export function SubscriptionActions({ cancelAtPeriodEnd, endsAtLabel }: {
  cancelAtPeriodEnd: boolean;
  endsAtLabel: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"cancel" | "resume" | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  async function resume() {
    setBusy("resume");
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Something went wrong");
      toast.success(body.message ?? "Updated.");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancel(reason: string, comment: string) {
    setBusy("cancel");
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", reason, comment }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Something went wrong");
      setShowCancel(false);
      toast.success(body.message ?? "Your subscription will end at the period's close.");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline">
          <a href="/api/billing/portal">
            Manage billing <ExternalLink size={14} />
          </a>
        </Button>
        {cancelAtPeriodEnd ? (
          <Button variant="outline" disabled={busy !== null} onClick={resume}>
            {busy === "resume" ? "Resuming…" : "Resume subscription"}
          </Button>
        ) : (
          <Button variant="ghost" disabled={busy !== null} onClick={() => setShowCancel(true)} className="text-ink-500 hover:text-red-600">
            Cancel subscription
          </Button>
        )}
      </div>

      <CancelSubscriptionDialog
        open={showCancel}
        endsAtLabel={endsAtLabel}
        busy={busy === "cancel"}
        onKeep={() => !busy && setShowCancel(false)}
        onConfirm={cancel}
      />
    </>
  );
}

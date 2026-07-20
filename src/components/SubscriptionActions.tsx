"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Manage-billing / cancel / resume controls for an active Paddle subscription.
// Cancellation is always end-of-period, so the copy promises exactly that.
export function SubscriptionActions({ cancelAtPeriodEnd, endsAtLabel }: {
  cancelAtPeriodEnd: boolean;
  endsAtLabel: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"cancel" | "resume" | null>(null);

  async function run(action: "cancel" | "resume") {
    if (action === "cancel" && !window.confirm(
      `Cancel your subscription?\n\nYou'll keep full access${endsAtLabel ? ` until ${endsAtLabel}` : " until the end of the current billing period"}, and you won't be charged again.`
    )) return;

    setBusy(action);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline">
        <a href="/api/billing/portal">
          Manage billing <ExternalLink size={14} />
        </a>
      </Button>
      {cancelAtPeriodEnd ? (
        <Button variant="outline" disabled={busy !== null} onClick={() => run("resume")}>
          {busy === "resume" ? "Resuming…" : "Resume subscription"}
        </Button>
      ) : (
        <Button variant="ghost" disabled={busy !== null} onClick={() => run("cancel")} className="text-ink-500 hover:text-red-600">
          {busy === "cancel" ? "Cancelling…" : "Cancel subscription"}
        </Button>
      )}
    </div>
  );
}

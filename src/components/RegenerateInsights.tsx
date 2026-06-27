"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// "Regenerate insights" for a saved report. Re-runs the AI over the report's
// own stored data (no Google calls) and refreshes the page to show the result.
// Shows loading + error states; success and "already up to date" are toasts.
export function RegenerateInsights({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/regenerate-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't regenerate insights");
        return;
      }
      toast.success("Insights regenerated");
      router.refresh();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={run} disabled={busy}>
      <Sparkles size={16} className={busy ? "animate-pulse" : ""} />
      {busy ? "Regenerating…" : "Regenerate insights"}
    </Button>
  );
}

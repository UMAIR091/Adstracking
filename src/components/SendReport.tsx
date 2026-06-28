"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// "Email report" — sends the report's share link to the client by email.
export function SendReport({ reportId, clientEmail }: { reportId: string; clientEmail: string | null }) {
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!confirm(clientEmail ? `Email this report to ${clientEmail}?` : "Email this report to the client?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't send the report");
        return;
      }
      toast.success(`Report emailed to ${data.sent} recipient${data.sent === 1 ? "" : "s"}`);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={send} disabled={busy}>
      <Mail size={16} className={busy ? "animate-pulse" : ""} />
      {busy ? "Sending…" : "Email report"}
    </Button>
  );
}

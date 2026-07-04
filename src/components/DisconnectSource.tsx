"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Disconnects any integration and deletes its stored data (tokens + cached
// snapshots cascade at the database level). Works for every provider — the
// endpoint is a generic RLS-scoped delete despite its /api/google path.
export function DisconnectSource({ dataSourceId, label }: { dataSourceId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    if (!confirm(`Disconnect ${label}?\n\nThis permanently deletes the stored connection tokens and all cached data for this source. Reports already generated are kept.`)) return;
    setBusy(true);
    const res = await fetch("/api/google/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return toast.error(body?.error ?? "Failed to disconnect");
    }
    toast.success(`${label} disconnected — stored data deleted`);
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={disconnect} disabled={busy}
      className="text-red-600 hover:bg-red-50 hover:text-red-700">
      <Trash2 size={14} /> {busy ? "Removing…" : "Disconnect & delete data"}
    </Button>
  );
}

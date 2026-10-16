"use client";

import { useState } from "react";
import { Check, Link2, Link2Off } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { changeShareLink, shareUrlFor } from "@/lib/reports/shareLinkClient";

/**
 * The report page's public-link controls: copy the link, revoke it (the old URL
 * then shows "Page not found"), or create a new one after a revoke. A shared
 * link used to live forever, so a report sent to a former client stayed
 * readable until the report itself was deleted.
 */
export function ShareLinkControls({ reportId, shareToken }: { reportId: string; shareToken: string | null }) {
  const confirm = useConfirm();
  const [token, setToken] = useState<string | null>(shareToken);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copy(t: string, message = "Share link copied") {
    try {
      await navigator.clipboard.writeText(shareUrlFor(t));
      setCopied(true);
      toast.success(message, { description: "Anyone with this link can view the report." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  async function create() {
    setBusy(true);
    try {
      const t = await changeShareLink(reportId, "renew");
      setToken(t);
      if (t) await copy(t, "New share link copied");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    const ok = await confirm({
      title: "Revoke share link?",
      description: "Anyone opening the current link will see “Page not found”. You can create a new link at any time, and emailing the report creates one automatically.",
      confirmLabel: "Revoke link",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await changeShareLink(reportId, "revoke");
      setToken(null);
      toast.success("Share link revoked");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Button variant="outline" onClick={create} disabled={busy}>
        <Link2 size={16} aria-hidden /> Create share link
      </Button>
    );
  }

  return (
    <div className="no-print flex items-center gap-2">
      <Button variant="outline" onClick={() => copy(token)} disabled={busy}>
        {copied ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />} {copied ? "Copied" : "Copy share link"}
      </Button>
      <Button variant="outline" onClick={revoke} disabled={busy} aria-label="Revoke share link" title="Turn off the current link">
        <Link2Off size={16} aria-hidden /> Revoke
      </Button>
    </div>
  );
}

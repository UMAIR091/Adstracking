"use client";

// "Send connect link" on a client's Data sources tab (migration 0048): the
// agency picks the platforms, gets a link to send the client, and the client
// connects their own accounts on their own device. The link is shown once,
// when created (only its hash is stored). Active links are listed here with
// a Revoke action. Same dialog pattern as ConnectAccountModal: portal, focus
// moves in and is restored, Escape closes, Tab is trapped.
import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Link2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { integrationIcon } from "@/components/integrationVisuals";

export type LinkIntegration = { id: string; name: string; icon: string; connected: boolean };
export type ActiveLink = { id: string; types: string[]; expiresAt: string; lastUsedAt: string | null };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function ConnectLinkButton({
  clientId,
  clientName,
  integrations,
  links,
}: {
  clientId: string;
  clientName: string;
  integrations: LinkIntegration[];
  links: ActiveLink[];
}) {
  const [open, setOpen] = React.useState(false);
  if (integrations.length === 0) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Link2 size={15} aria-hidden /> Send connect link
      </Button>
      {open && (
        <LinkDialog
          clientId={clientId}
          clientName={clientName}
          integrations={integrations}
          links={links}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function LinkDialog({
  clientId,
  clientName,
  integrations,
  links,
  onClose,
}: {
  clientId: string;
  clientName: string;
  integrations: LinkIntegration[];
  links: ActiveLink[];
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);
  // Platforms not yet connected are the likely ask, so they start ticked.
  const [chosen, setChosen] = React.useState<Set<string>>(
    () => new Set(integrations.filter((i) => !i.connected).slice(0, 4).map((i) => i.id))
  );
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const names = React.useMemo(() => new Map(integrations.map((i) => [i.id, i.name])), [integrations]);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => prev?.focus?.();
  }, [mounted]);
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (f.length === 0) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    setBusy(true);
    const res = await fetch("/api/connect-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, types: Array.from(chosen) }),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(body.error ?? "Couldn't create the link");
    setCreated({ url: body.url, expiresAt: body.expiresAt });
    router.refresh();
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/connect-links/${id}/revoke`, { method: "POST" });
    if (!res.ok) return toast.error("Couldn't revoke the link");
    toast.success("Link revoked");
    router.refresh();
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-overlay/40 animate-fade-in" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-title"
        className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ink-200 bg-surface shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 p-5">
          <div>
            <h2 id="link-title" className="text-lg font-semibold text-ink-900">Send {clientName} a connect link</h2>
            <p className="mt-0.5 text-sm text-ink-500">
              They open it on their own phone or laptop and sign in to each platform themselves. You never need their
              passwords.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {created ? (
            <div>
              <p className="text-sm font-medium text-ink-900">Your link is ready</p>
              <p className="mt-0.5 text-sm text-ink-500">
                Copy it now: for security it isn&apos;t shown again. It works until {day(created.expiresAt)}.
              </p>
              <div className="mt-3 flex gap-2">
                <input readOnly value={created.url} onFocus={(e) => e.currentTarget.select()} className="field h-10 min-w-0 flex-1 text-sm" />
                <Button onClick={copy}>
                  {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-ink-900">Which platforms should they connect?</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {integrations.map((i) => {
                  const Icon = integrationIcon(i.icon);
                  return (
                    <li key={i.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-800 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50">
                        <input type="checkbox" checked={chosen.has(i.id)} onChange={() => toggle(i.id)} className="h-4 w-4" />
                        <Icon size={15} aria-hidden className="text-ink-500" />
                        <span className="truncate">{i.name}</span>
                        {i.connected && <span className="ml-auto text-xs text-ink-400">connected</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 flex justify-end">
                <Button onClick={create} disabled={busy || chosen.size === 0}>
                  {busy ? "Creating…" : "Create link"}
                </Button>
              </div>
            </div>
          )}

          {links.length > 0 && (
            <div className="mt-6 border-t border-ink-100 pt-4">
              <p className="text-sm font-medium text-ink-900">Active links</p>
              <ul className="mt-2 space-y-2">
                {links.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-subtle px-3 py-2 text-xs text-ink-600">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink-800">
                        {l.types.map((t) => names.get(t) ?? t).join(", ")}
                      </span>
                      Works until {day(l.expiresAt)}
                      {l.lastUsedAt ? ` · last used ${day(l.lastUsedAt)}` : " · not used yet"}
                    </span>
                    <button
                      type="button"
                      onClick={() => revoke(l.id)}
                      className="shrink-0 font-medium text-danger-600 hover:underline"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

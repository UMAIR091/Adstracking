"use client";

// Email Branding: the sender identity (name / from / reply-to / footer) plus
// the white-label sending-domain flow (add domain → publish DNS records →
// verify). Until a domain is verified and the sender address is on it, report
// emails go out from the platform's default sender — configuring this section
// is what removes the last visible trace of the platform from client emails.
//
// Identity fields save through the RLS Supabase client like the rest of the
// settings page; domain operations go through /api/email/domain because they
// call the email provider's API with the server-side key. Note the stored
// sender address is only a request — the send pipeline re-validates it against
// the verified domain on every send, so nothing here can enable spoofing.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AtSign, CheckCircle2, Copy, Globe, Loader2, MailCheck, RefreshCw, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type EmailValues = {
  email_sender_name: string;
  email_sender_email: string;
  email_reply_to: string;
  email_footer: string;
};

type DnsRecord = { record: string; name: string; type: string; value: string; ttl?: string; priority?: number; status?: string };
type DomainView = { domain: string; status: string; records: DnsRecord[]; lastCheckedAt: string | null };

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "danger" | "muted" }> = {
  verified: { label: "Verified", variant: "success" },
  pending: { label: "Pending DNS", variant: "warning" },
  not_started: { label: "Awaiting DNS", variant: "warning" },
  temporary_failure: { label: "Retrying", variant: "warning" },
  failed: { label: "Failed", variant: "danger" },
};

export function EmailBrandingSettings({ agencyId, initial }: { agencyId: string; initial: EmailValues }) {
  const router = useRouter();
  const supabase = createClient();
  const [v, setV] = useState<EmailValues>(initial);
  const [saving, setSaving] = useState(false);

  const [domain, setDomain] = useState<DomainView | null>(null);
  const [domainLoaded, setDomainLoaded] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [busy, setBusy] = useState<"add" | "verify" | "remove" | "test" | null>(null);

  const loadDomain = useCallback(async () => {
    try {
      const res = await fetch("/api/email/domain");
      const body = await res.json().catch(() => null);
      if (res.ok) setDomain(body?.domain ?? null);
    } finally {
      setDomainLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadDomain();
  }, [loadDomain]);

  function set<K extends keyof EmailValues>(k: K, val: EmailValues[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("agencies")
      .update({
        email_sender_name: v.email_sender_name.trim() || null,
        email_sender_email: v.email_sender_email.trim().toLowerCase() || null,
        email_reply_to: v.email_reply_to.trim() || null,
        email_footer: v.email_footer.trim() || null,
      })
      .eq("id", agencyId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Email settings saved");
    router.refresh();
  }

  async function addDomain() {
    setBusy("add");
    try {
      const res = await fetch("/api/email/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't add the domain");
      setDomain(body.domain);
      setNewDomain("");
      toast.success("Domain added — now publish the DNS records below.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function verifyDomain() {
    setBusy("verify");
    try {
      const res = await fetch("/api/email/domain/verify", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Verification failed");
      setDomain(body.domain);
      toast[body.domain.status === "verified" ? "success" : "info"](
        body.domain.status === "verified"
          ? "Domain verified — white-label sending is active."
          : "Verification requested. DNS changes can take up to an hour to propagate; check back shortly."
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeDomain() {
    if (!window.confirm("Remove this sending domain? Reports will fall back to the default sender.")) return;
    setBusy("remove");
    try {
      const res = await fetch("/api/email/domain", { method: "DELETE" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't remove the domain");
      setDomain(null);
      toast.success("Sending domain removed.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Sends a real email through the same path scheduled reports use, so the
  // result reflects what clients would actually receive.
  async function sendTest() {
    setBusy("test");
    try {
      const res = await fetch("/api/email/test", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't send the test email");
      toast[body.whiteLabel ? "success" : "info"](body.message, { duration: 8000 });
    } catch (err) {
      toast.error((err as Error).message, { duration: 8000 });
    } finally {
      setBusy(null);
    }
  }

  const senderDomain = v.email_sender_email.includes("@") ? v.email_sender_email.split("@").pop()?.toLowerCase() : null;
  const verified = domain?.status === "verified";
  const whiteLabelActive = Boolean(verified && senderDomain && senderDomain === domain?.domain);
  const senderMismatch = Boolean(verified && senderDomain && senderDomain !== domain?.domain);
  const badge = domain ? STATUS_BADGE[domain.status] ?? { label: domain.status, variant: "muted" as const } : null;

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MailCheck size={17} className="text-brand-500" /> Email branding</CardTitle>
        <CardDescription>
          Send report emails from your own address and domain. Your logo, company name and brand color from Agency
          branding above are used in the email automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sender identity */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="email_sender_name">Sender name</Label>
            <Input id="email_sender_name" placeholder="ABC Marketing" value={v.email_sender_name} onChange={(e) => set("email_sender_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email_sender_email">Sender email</Label>
            <Input id="email_sender_email" type="email" placeholder="reports@your-agency.com" value={v.email_sender_email} onChange={(e) => set("email_sender_email", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email_reply_to">Reply-to email</Label>
            <Input id="email_reply_to" type="email" placeholder="hello@your-agency.com" value={v.email_reply_to} onChange={(e) => set("email_reply_to", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email_footer">Email footer line</Label>
            <Input id="email_footer" placeholder="Questions? Just reply to this email." value={v.email_footer} onChange={(e) => set("email_footer", e.target.value)} />
          </div>
        </div>

        {/* Effective state, stated plainly so there's no guessing. */}
        <div className={`rounded-xl border px-4 py-3 text-sm ${whiteLabelActive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-ink-600"}`}>
          {whiteLabelActive ? (
            <span className="flex items-center gap-2"><CheckCircle2 size={15} /> White-label active — clients see <span className="font-semibold">{v.email_sender_name || "your agency"} &lt;{v.email_sender_email}&gt;</span>.</span>
          ) : senderMismatch ? (
            <>Sender email must be on <span className="font-semibold">@{domain?.domain}</span> for white-label sending — currently it's on @{senderDomain}. Reports use the default sender until this matches.</>
          ) : verified ? (
            <>Domain verified. Set a sender email on <span className="font-semibold">@{domain?.domain}</span> above to activate white-label sending.</>
          ) : (
            <>Reports currently send from the default sender. Verify your domain below to send from your own address.</>
          )}
        </div>

        {/* Domain verification */}
        <div className="border-t border-slate-100 pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-ink-800"><Globe size={15} className="text-ink-400" /> Sending domain</p>
            {badge && <Badge variant={badge.variant} dot>{badge.label}</Badge>}
          </div>

          {!domainLoaded ? (
            <p className="flex items-center gap-2 py-3 text-sm text-ink-400"><Loader2 size={14} className="animate-spin" /> Loading…</p>
          ) : !domain ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-ink-500">
                Add the domain you want to send from (e.g. <span className="font-medium text-ink-700">your-agency.com</span>).
                You'll get DNS records to add at your domain host — verification usually completes within minutes of
                publishing them.
              </p>
              <div className="flex gap-2">
                <Input placeholder="your-agency.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newDomain && addDomain()} />
                <Button onClick={addDomain} disabled={!newDomain.trim() || busy !== null}>
                  {busy === "add" ? "Adding…" : "Add domain"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm text-ink-700"><AtSign size={14} className="text-ink-400" /><span className="font-semibold">{domain.domain}</span></p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={verifyDomain} disabled={busy !== null}>
                    {busy === "verify" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {verified ? "Re-verify" : "Verify DNS"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={removeDomain} disabled={busy !== null} className="text-ink-500 hover:text-red-600">
                    <Trash2 size={14} /> Remove
                  </Button>
                </div>
              </div>

              {!verified && (
                <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink-600">
                  <li>Open the DNS settings at your domain host (Cloudflare, GoDaddy, Namecheap…).</li>
                  <li>Add each record below exactly as shown — name, type and value.</li>
                  <li>Come back and press <span className="font-medium">Verify DNS</span>. Propagation usually takes minutes, occasionally up to 48h.</li>
                </ol>
              )}

              {domain.records.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-ink-500">
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Name / host</th>
                        <th className="px-3 py-2 font-medium">Value</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {domain.records.map((r, i) => (
                        <tr key={i} className="align-top">
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-ink-800">{r.type}{r.priority != null ? ` (prio ${r.priority})` : ""}</td>
                          <td className="max-w-[160px] break-all px-3 py-2 font-mono text-[11px] text-ink-700">{r.name}</td>
                          <td className="max-w-[220px] break-all px-3 py-2 font-mono text-[11px] text-ink-700">{r.value}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <Badge variant={r.status === "verified" ? "success" : "muted"}>{r.status ?? "pending"}</Badge>
                          </td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => copy(r.value)} className="text-ink-400 hover:text-ink-700" aria-label={`Copy ${r.type} value`}>
                              <Copy size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            <Button variant="outline" onClick={sendTest} disabled={busy !== null}>
              {busy === "test" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send test email
            </Button>
            <p className="mt-1.5 text-xs text-ink-400">
              Sends a branded sample to your own address using these exact settings — save first if you&apos;ve made changes.
            </p>
          </div>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save email settings"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Trash2, Clock, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";

export type MemberView = {
  userId: string;
  email: string;
  role: "owner" | "admin" | "member";
  isYou: boolean;
};

export type InviteView = {
  id: string;
  email: string;
  role: "admin" | "member";
  createdAt: string;
  expiresAt: string;
};

const ROLE_BADGE = {
  owner: { label: "Owner", variant: "default" as const },
  admin: { label: "Admin", variant: "info" as const },
  member: { label: "Member", variant: "muted" as const },
};

export function TeamManager({
  members,
  invites,
  canManage,
  emailReady,
}: {
  members: MemberView[];
  invites: InviteView[];
  canManage: boolean;
  /** False when RESEND_API_KEY/EMAIL_FROM are missing — invites can't be sent. */
  emailReady: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [busy, setBusy] = useState(false);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;

    setBusy(true);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, role }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? "Couldn't send the invitation.");
        return;
      }
      toast.success(`Invitation sent to ${value}`, { description: "The link is valid for 7 days." });
      setEmail("");
      router.refresh();
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(invite: InviteView) {
    const ok = await confirm({
      title: "Revoke this invitation?",
      description: `${invite.email} will no longer be able to use their invite link.`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;

    const res = await fetch(`/api/team/invite?id=${encodeURIComponent(invite.id)}`, { method: "DELETE" });
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      toast.error(b?.error ?? "Couldn't revoke that invitation.");
      return;
    }
    toast.success("Invitation revoked");
    router.refresh();
  }

  async function removeMember(member: MemberView) {
    const ok = await confirm({
      title: `Remove ${member.email}?`,
      description: "They'll immediately lose access to this workspace's clients, reports and integrations.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;

    const res = await fetch(`/api/team/members?userId=${encodeURIComponent(member.userId)}`, { method: "DELETE" });
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      toast.error(b?.error ?? "Couldn't remove that member.");
      return;
    }
    toast.success(`${member.email} removed`);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>People with access to this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {members.map((m) => {
              const badge = ROLE_BADGE[m.role];
              return (
                <li
                  key={m.userId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-surface-muted/40 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                      {(m.email[0] || "U").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {m.email} {m.isYou && <span className="text-ink-500">(you)</span>}
                      </p>
                      <p className="text-xs text-ink-500">
                        {m.role === "owner" ? "Workspace owner" : m.role === "admin" ? "Can manage settings & team" : "Can manage clients & reports"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {canManage && m.role !== "owner" && !m.isYou && (
                      <Button size="sm" variant="ghost" onClick={() => removeMember(m)} aria-label={`Remove ${m.email}`}>
                        <Trash2 size={15} aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock size={16} className="text-amber-500" aria-hidden /> Pending invitations
            </CardTitle>
            <CardDescription>Sent, but not accepted yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {invites.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{i.email}</p>
                    <p className="text-xs text-ink-500">
                      Invited as {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="warning">Pending</Badge>
                    {canManage && (
                      <Button size="sm" variant="ghost" onClick={() => revoke(i)} aria-label={`Revoke invite for ${i.email}`}>
                        <Trash2 size={15} aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>They&apos;ll get access to clients, integrations and reports.</CardDescription>
          </CardHeader>
          <CardContent>
            {!emailReady && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Email isn&apos;t configured, so invitations can&apos;t be delivered yet. Set{" "}
                <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> to enable this.
              </p>
            )}
            <form onSubmit={sendInvite} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <Label htmlFor="invite-email">Email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@agency.com"
                  disabled={busy || !emailReady}
                />
              </div>
              <div>
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "member")}
                  disabled={busy || !emailReady}
                  className="h-10 rounded-xl border border-ink-200 bg-surface px-3 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <Button type="submit" size="lg" disabled={busy || !emailReady}>
                <Mail size={16} aria-hidden /> {busy ? "Sending…" : "Send invite"}
              </Button>
            </form>
            <div className="mt-4 grid gap-2 text-xs text-ink-500 sm:grid-cols-2">
              <p className="flex items-start gap-1.5">
                <User size={13} className="mt-0.5 shrink-0" aria-hidden />
                <span><strong className="text-ink-700">Member</strong> — manage clients, integrations and reports.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <ShieldCheck size={13} className="mt-0.5 shrink-0" aria-hidden />
                <span><strong className="text-ink-700">Admin</strong> — everything a member can do, plus settings, billing and the team.</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

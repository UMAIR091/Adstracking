import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SoonButton } from "@/components/SoonButton";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { user } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  const email = user.email ?? "you@agency.com";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Team</h1>
        <p className="text-sm text-ink-500">Invite teammates to collaborate on clients and reports.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>People with access to this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                {(email[0] || "U").toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-ink-900">{email}</p>
                <p className="text-xs text-ink-500">Workspace owner</p>
              </div>
            </div>
            <Badge variant="default">Owner</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite a teammate</CardTitle>
          <CardDescription>They&apos;ll get access to clients, integrations and reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label>Email address</Label>
              <Input type="email" placeholder="teammate@agency.com" />
            </div>
            <SoonButton message="Team invitations arrive with multi-user support." size="lg">
              <Mail size={16} /> Send invite
            </SoonButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

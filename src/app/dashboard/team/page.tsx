import { redirect } from "next/navigation";
import { getCurrentUserAndAgency, isAdminRole } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured } from "@/lib/email";
import { TeamManager, type MemberView, type InviteView } from "@/components/TeamManager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { user, agency, role } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();

  // Memberships are readable by the whole team (RLS); pending invitations only
  // by admins, so a member simply sees an empty list rather than an error.
  const [{ data: membershipRows }, { data: inviteRows }] = await Promise.all([
    supabase.from("memberships").select("user_id, role, created_at").eq("agency_id", agency.id).order("created_at"),
    isAdminRole(role)
      ? supabase
          .from("invitations")
          .select("id, email, role, created_at, expires_at")
          .eq("agency_id", agency.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  // auth.users isn't exposed to the anon key, so member email addresses are
  // resolved with the service role. Only ids already visible through this
  // agency's memberships are looked up — no directory-wide read.
  const admin = createAdminClient();
  const ids = new Set((membershipRows ?? []).map((m) => m.user_id as string));
  const emailById = new Map<string, string>();
  if (ids.size) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of list?.users ?? []) {
      if (ids.has(u.id)) emailById.set(u.id, u.email ?? "");
    }
  }

  const members: MemberView[] = (membershipRows ?? []).map((m) => ({
    userId: m.user_id as string,
    email: emailById.get(m.user_id as string) || "Unknown user",
    role: (m.role as MemberView["role"]) ?? "member",
    isYou: m.user_id === user.id,
  }));

  // Owner first, then admins, then members — the list reads as a hierarchy.
  const ORDER = { owner: 0, admin: 1, member: 2 };
  members.sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.email.localeCompare(b.email));

  const invites: InviteView[] = ((inviteRows ?? []) as Record<string, unknown>[]).map((i) => ({
    id: i.id as string,
    email: i.email as string,
    role: (i.role as InviteView["role"]) ?? "member",
    createdAt: i.created_at as string,
    expiresAt: i.expires_at as string,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Team</h1>
        <p className="text-sm text-ink-500">Invite teammates to collaborate on clients and reports.</p>
      </div>

      <TeamManager
        members={members}
        invites={invites}
        canManage={isAdminRole(role)}
        emailReady={emailConfigured()}
      />
    </div>
  );
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency, isAdminRole } from "@/lib/agency";
import { isInviteRole } from "@/lib/team";

export const runtime = "nodejs";

// Removes a member from the workspace.
//
// The owner is deliberately not removable: agencies.owner_id is the anchor the
// RLS safety net falls back to, and an agency with no owner would be
// unrecoverable through the UI.
export async function DELETE(req: Request) {
  const { user, agency, role } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

  if (userId === agency.owner_id) {
    return NextResponse.json({ error: "The workspace owner can't be removed." }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("agency_id", agency.id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: "Couldn't remove that member." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Changes a member's role.
export async function PATCH(req: Request) {
  const { user, agency, role } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { userId?: string; role?: string } | null;
  if (!body?.userId || !isInviteRole(body.role)) {
    return NextResponse.json({ error: "userId and role (admin/member) are required." }, { status: 400 });
  }
  if (body.userId === agency.owner_id) {
    return NextResponse.json({ error: "The workspace owner's role can't be changed." }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ role: body.role })
    .eq("agency_id", agency.id)
    .eq("user_id", body.userId);

  if (error) return NextResponse.json({ error: "Couldn't update that member's role." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

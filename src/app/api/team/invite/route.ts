import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAndAgency, isAdminRole } from "@/lib/agency";
import { emailConfigured, sendEmailWithRetry, invitationEmailHtml } from "@/lib/email";
import { captureServer } from "@/lib/analyticsServer";
import { ANALYTICS } from "@/lib/analytics";
import { publicError } from "@/lib/errors";
import {
  generateInviteToken, hashInviteToken, inviteExpiry, inviteUrl,
  isValidEmail, isInviteRole, normalizeEmail, INVITE_TTL_DAYS,
} from "@/lib/team";

export const runtime = "nodejs";

// Creates a team invitation and emails it.
//
// The email send is AWAITED and its failure is surfaced: an invite the
// recipient never receives is worse than a visible error, because the sender
// believes it worked. If the mail fails we delete the freshly created row so
// the address isn't left blocked by the pending-unique index and the user can
// simply try again.
export async function POST(req: Request) {
  const { user, agency, role } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(role)) {
    return NextResponse.json({ error: "Only workspace owners and admins can invite teammates." }, { status: 403 });
  }

  // Checked before anything is written, so we never create an invitation we
  // have no way to deliver.
  if (!emailConfigured()) {
    return NextResponse.json(
      { error: "Email isn't configured yet, so invitations can't be sent. Set RESEND_API_KEY and EMAIL_FROM." },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => null)) as { email?: string; role?: string } | null;
  const email = normalizeEmail(String(body?.email ?? ""));
  const inviteRole = isInviteRole(body?.role) ? body.role : "member";

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (email === normalizeEmail(user.email ?? "")) {
    return NextResponse.json({ error: "You're already in this workspace." }, { status: 400 });
  }

  const supabase = createClient();
  const admin = createAdminClient();

  // Already a member? Checked with the admin client because memberships only
  // exposes rows for agencies the caller belongs to — which is true here, but
  // the auth.users lookup that resolves an email to a user id is admin-only.
  const { data: existingUser } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const match = existingUser?.users?.find((u) => normalizeEmail(u.email ?? "") === email);
  if (match) {
    const { data: alreadyMember } = await admin
      .from("memberships")
      .select("id")
      .eq("agency_id", agency.id)
      .eq("user_id", match.id)
      .maybeSingle();
    if (alreadyMember) {
      return NextResponse.json({ error: `${email} is already a member of this workspace.` }, { status: 409 });
    }
  }

  // Supersede any outstanding invite for this address rather than colliding
  // with the partial unique index — re-inviting should just work.
  await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("agency_id", agency.id)
    .eq("status", "pending")
    .ilike("email", email);

  const token = generateInviteToken();

  const { data: invite, error: insertError } = await supabase
    .from("invitations")
    .insert({
      agency_id: agency.id,
      email,
      role: inviteRole,
      token_hash: hashInviteToken(token),
      invited_by: user.id,
      expires_at: inviteExpiry(),
    })
    .select("id, email, role, status, expires_at, created_at")
    .single();

  if (insertError || !invite) {
    const { error } = publicError(insertError?.message, "Couldn't create the invitation.", {
      route: "team_invite",
      agencyId: agency.id,
    });
    return NextResponse.json({ error }, { status: 500 });
  }

  try {
    const from = (process.env.EMAIL_FROM ?? "").trim();
    const { id: providerId, attempts } = await sendEmailWithRetry({
      from,
      to: [email],
      subject: `${agency.name} invited you to join them on ReportFlow`,
      html: invitationEmailHtml({
        agencyName: agency.name,
        inviterEmail: user.email ?? null,
        role: inviteRole,
        inviteUrl: inviteUrl(token),
        expiryDays: INVITE_TTL_DAYS,
      }),
      replyTo: user.email ?? undefined,
    });

    // Delivery record, so an invite that bounces is visible in the same place
    // as every other email the product sends. report_id is null: this isn't a
    // report delivery, which is also how the 1/min test-email limiter finds it.
    await admin.from("email_logs").insert({
      agency_id: agency.id,
      report_id: null,
      to_email: email,
      subject: `${agency.name} invited you to join them on ReportFlow`,
      provider_id: providerId,
      status: "sent",
      attempts,
      source: "manual",
    });

    await captureServer(user.id, ANALYTICS.teamInviteSent, { role: inviteRole });

    return NextResponse.json({ ok: true, invite: { ...invite, email } });
  } catch (err) {
    // Roll the invitation back. Leaving it pending would block re-inviting the
    // same address behind invitations_pending_uniq while the recipient has
    // nothing in their inbox — the exact failure this endpoint exists to avoid.
    await supabase.from("invitations").delete().eq("id", invite.id);

    const message = (err as Error).message;
    console.error(`team invite email failed for ${email} (agency ${agency.id}): ${message}`);
    await admin.from("email_logs").insert({
      agency_id: agency.id,
      report_id: null,
      to_email: email,
      subject: `${agency.name} invited you to join them on ReportFlow`,
      status: "failed",
      error: message.slice(0, 500),
      attempts: 3,
      source: "manual",
    });

    return NextResponse.json(
      { error: `Couldn't send the invitation email to ${email}. ${message.slice(0, 200)}` },
      { status: 502 }
    );
  }
}

// Revokes a pending invitation.
export async function DELETE(req: Request) {
  const { user, agency, role } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const supabase = createClient();
  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("agency_id", agency.id)
    .eq("status", "pending");

  if (error) return NextResponse.json({ error: "Couldn't revoke that invitation." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

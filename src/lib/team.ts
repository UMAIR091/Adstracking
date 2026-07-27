// Team invitations: token handling, creation and acceptance.
//
// The token is a 256-bit random string that exists in exactly one place the
// database can see: nowhere. Only its SHA-256 hash is stored, so read access to
// `invitations` (or a leaked backup) cannot be turned into workspace access —
// the raw token lives only in the emailed link and in the invitee's browser.
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** How long an invite stays valid. Long enough to survive a weekend inbox. */
export const INVITE_TTL_DAYS = 7;

export type InviteRole = "admin" | "member";

export function isInviteRole(v: unknown): v is InviteRole {
  return v === "admin" || v === "member";
}

/** Emails are matched case-insensitively throughout, so normalise once here. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  // Deliberately permissive: the authoritative test is whether it delivers.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

/** A fresh invite token. URL-safe so it can sit in a path segment unescaped. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare, for anywhere two hashes are checked directly. */
export function hashesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function inviteExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function inviteUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/invite/${token}`;
}

export type AcceptResult =
  | { ok: true; agencyId: string; agencyName: string; alreadyMember: boolean }
  | { ok: false; reason: "not_found" | "expired" | "revoked" | "already_accepted" | "email_mismatch" | "error"; message: string };

/**
 * Accepts an invitation and creates the membership.
 *
 * Runs with the service role by necessity: the invitee is not yet a member of
 * the agency, so every RLS policy on `invitations` and `memberships` would
 * (correctly) hide the rows from them. All authorisation is therefore enforced
 * here explicitly rather than by the database.
 *
 * The email check is the load-bearing one: possessing the link is not enough,
 * the signed-in account must be the address that was invited. Without it a
 * forwarded email would hand a stranger access to the workspace.
 */
export async function acceptInvitation(
  admin: SupabaseClient,
  args: { token: string; userId: string; userEmail: string | null | undefined }
): Promise<AcceptResult> {
  const tokenHash = hashInviteToken(args.token);

  const { data: invite, error } = await admin
    .from("invitations")
    .select("id, agency_id, email, role, status, expires_at, agencies(name)")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) return { ok: false, reason: "error", message: "Couldn't look up that invitation." };
  if (!invite) return { ok: false, reason: "not_found", message: "This invitation link isn't valid." };

  if (invite.status === "revoked") {
    return { ok: false, reason: "revoked", message: "This invitation was revoked by the workspace owner." };
  }
  if (invite.status === "accepted") {
    return { ok: false, reason: "already_accepted", message: "This invitation has already been used." };
  }
  if (new Date(invite.expires_at as string).getTime() < Date.now()) {
    // Record the expiry so the team list stops showing it as outstanding.
    await admin.from("invitations").update({ status: "expired" }).eq("id", invite.id).eq("status", "pending");
    return { ok: false, reason: "expired", message: `This invitation has expired. Ask for a new one.` };
  }

  const invitedEmail = normalizeEmail(invite.email as string);
  const signedInEmail = args.userEmail ? normalizeEmail(args.userEmail) : "";
  if (!signedInEmail || signedInEmail !== invitedEmail) {
    return {
      ok: false,
      reason: "email_mismatch",
      message: `This invitation was sent to ${invitedEmail}. Sign in with that address to accept it.`,
    };
  }

  const agencyName = agencyNameOf(invite.agencies) ?? "the workspace";

  // Idempotent: unique(agency_id, user_id) means a double-click or a refresh
  // re-uses the existing membership instead of failing or duplicating it.
  const { error: memberError } = await admin
    .from("memberships")
    .upsert(
      { agency_id: invite.agency_id, user_id: args.userId, role: invite.role },
      { onConflict: "agency_id,user_id", ignoreDuplicates: true }
    );
  if (memberError) {
    console.error(`membership creation failed for invite ${invite.id}: ${memberError.message}`);
    return { ok: false, reason: "error", message: "Couldn't add you to the workspace. Please try again." };
  }

  // Only mark accepted once the membership exists — if the step above fails the
  // invite stays pending and remains usable, rather than burning the link.
  const { error: statusError } = await admin
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: args.userId })
    .eq("id", invite.id)
    .eq("status", "pending");
  if (statusError) console.error(`invite ${invite.id} accepted but status update failed: ${statusError.message}`);

  return { ok: true, agencyId: invite.agency_id as string, agencyName, alreadyMember: false };
}

// Supabase types a to-one join as either an object or a single-element array
// depending on the query shape, so both are normalised.
function agencyNameOf(a: unknown): string | null {
  if (Array.isArray(a)) return (a[0] as { name?: string } | undefined)?.name ?? null;
  return (a as { name?: string } | null)?.name ?? null;
}

import { createClient } from "@/lib/supabase/server";

export type AgencyRole = "owner" | "admin" | "member";

export type Agency = {
  id: string;
  owner_id: string;
  name: string;
  logo_url: string | null;
  brand_color: string;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  footer_text: string | null;
  // Email branding (white-label sending) — see lib/email/sender.ts.
  email_sender_name: string | null;
  email_sender_email: string | null;
  email_reply_to: string | null;
  email_footer: string | null;
  // Onboarding / localization / retention (migration 0028).
  timezone: string | null;
  report_language: string | null;
  onboarding_completed_at: string | null;
  last_seen_at: string | null;
};

/** Roles allowed to change settings, billing and the team (migration 0032). */
export function isAdminRole(role: AgencyRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

// Returns the signed-in user, their agency and their role in it.
//
// Resolution order matters. Owning an agency is checked first so an owner's
// experience is byte-for-byte what it was before team support existed. Only
// then do we fall back to an agency the user was invited into — without that
// branch a member would match no agency and the create-on-first-login path
// below would silently mint them a second, empty workspace.
export async function getCurrentUserAndAgency() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, agency: null as Agency | null, role: null as AgencyRole | null };

  const { data: owned } = await supabase
    .from("agencies")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (owned) {
    // Owners predating the team release have no membership row. Write it once,
    // lazily, so the team list shows them and role lookups stay uniform. RLS
    // permits this: you are an admin of an agency you own.
    await ensureOwnerMembership(supabase, owned.id, user.id);
    return { user, agency: owned as Agency, role: "owner" as AgencyRole };
  }

  // Invited member. RLS on agencies already restricts this to workspaces the
  // user belongs to, so no explicit join is needed; ordering keeps the choice
  // deterministic if they are ever in more than one.
  const { data: joined } = await supabase
    .from("agencies")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (joined) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("role")
      .eq("agency_id", joined.id)
      .eq("user_id", user.id)
      .maybeSingle();
    return { user, agency: joined as Agency, role: ((membership?.role as AgencyRole) ?? "member") as AgencyRole };
  }

  const { data: created } = await supabase
    .from("agencies")
    .insert({ owner_id: user.id, name: "My Agency", contact_email: user.email })
    .select("*")
    .single();

  if (created) await ensureOwnerMembership(supabase, created.id, user.id);

  return { user, agency: (created ?? null) as Agency | null, role: created ? ("owner" as AgencyRole) : null };
}

// Idempotent via the unique(agency_id, user_id) constraint. Never throws: a
// failure here must not block sign-in, and the RLS helper falls back to
// agencies.owner_id so an owner keeps access even if this row is missing.
async function ensureOwnerMembership(
  supabase: ReturnType<typeof createClient>,
  agencyId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("memberships")
    .upsert({ agency_id: agencyId, user_id: userId, role: "owner" }, { onConflict: "agency_id,user_id", ignoreDuplicates: true });
  if (error) console.error(`owner membership upsert failed for agency ${agencyId}: ${error.message}`);
}

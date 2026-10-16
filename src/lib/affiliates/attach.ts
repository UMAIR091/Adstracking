// Links a newly created agency to the affiliate whose link brought it in.
//
// Called once, from the one place an agency is created: the first signed-in
// request of a new user (lib/agency.ts getCurrentUserAndAgency). That covers
// email and Google signup alike, and a user who confirms their email later in
// the same browser. A signup on another device simply has no cookie and gets
// no attribution.
//
// Writes with the service role: the referral tables have no tenant grants
// (migration 0043). Never throws and never blocks signup.
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/monitoring";
import { REF_COOKIE, decodeRefCookie, isSelfReferral } from "./rules";

export type AttachResult = "attached" | "no_cookie" | "unknown_code" | "paused" | "self_referral" | "failed";

export async function attachReferral(
  agencyId: string,
  userEmail: string | null | undefined,
  // Injected in tests; production reads the request cookie and uses the
  // service-role client.
  deps: { admin?: SupabaseClient; cookieValue?: string | null } = {}
): Promise<AttachResult> {
  try {
    const value = "cookieValue" in deps ? deps.cookieValue : (await cookies()).get(REF_COOKIE)?.value;
    const ref = decodeRefCookie(value);
    if (!ref) return "no_cookie";

    const admin = deps.admin ?? createAdminClient();
    const { data: affiliate, error: lookupError } = await admin
      .from("affiliates")
      .select("id, email, status")
      .eq("code", ref.code)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!affiliate) return "unknown_code";
    if (affiliate.status !== "active") return "paused";
    if (isSelfReferral(userEmail, affiliate.email as string)) return "self_referral";

    // First touch wins at the database too: an agency that already has a
    // referral keeps it (ON CONFLICT DO NOTHING).
    const { error } = await admin
      .from("referrals")
      .upsert(
        { agency_id: agencyId, affiliate_id: affiliate.id, landing_path: ref.landingPath },
        { onConflict: "agency_id", ignoreDuplicates: true }
      );
    if (error) throw new Error(error.message);

    // Clearing works where cookies are writable (route handlers, actions). In a
    // server component it throws, and middleware expires the cookie on the
    // same response instead (lib/affiliates/capture.ts).
    try {
      if (!("cookieValue" in deps)) (await cookies()).delete(REF_COOKIE);
    } catch {
      /* cleared by middleware */
    }
    return "attached";
  } catch (err) {
    captureException(err, { area: "affiliates.attach", agencyId });
    return "failed";
  }
}

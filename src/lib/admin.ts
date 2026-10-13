// Platform-owner gate for internal pages (/dashboard/admin/*).
//
// Distinct from a workspace's own "admin" role (lib/agency.ts isAdminRole):
// that is any customer administering their own agency, while this is the
// people who run Anavyst itself. Membership is the ADMIN_EMAILS env var —
// comma-separated, matched case-insensitively against the signed-in user's
// email. Unset or empty means nobody, so a missing variable fails closed.
//
// Every admin page AND every admin action or route calls requirePlatformAdmin
// itself; a hidden link is not access control.
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export function adminEmails(env: string | undefined = process.env.ADMIN_EMAILS): Set<string> {
  return new Set(
    (env ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"))
  );
}

export function isPlatformAdmin(email: string | null | undefined, env?: string): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e !== "" && adminEmails(env).has(e);
}

/** The signed-in platform admin, or null for anyone else (callers 404). */
export async function requirePlatformAdmin(): Promise<User | null> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return user && isPlatformAdmin(user.email) ? user : null;
}

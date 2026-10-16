import type { SupabaseClient, User } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/team";

// Resolves an email to an auth user. The admin API has no lookup by email, only
// a paged list, and reading just the first page (1,000 users) meant that once
// Anavyst passed that many accounts, an existing user beyond it looked like a
// stranger. Pages through until a match or the last page.
export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
  { perPage = 1000, maxPages = 100 }: { perPage?: number; maxPages?: number } = {}
): Promise<User | null> {
  const wanted = normalizeEmail(email);
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const hit = users.find((u) => normalizeEmail(u.email ?? "") === wanted);
    if (hit) return hit;
    if (users.length < perPage) return null;
  }
  return null;
}

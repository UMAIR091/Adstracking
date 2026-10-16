import { createServerClient } from "@supabase/ssr";
import { cookies, type UnsafeUnwrappedCookies } from "next/headers";

// Server-side Supabase client (server components, route handlers, actions).
// Uses the user's session cookies, so RLS applies as that user.
export function createClient() {
  // Next 15 still supports reading cookies synchronously (it warns in dev);
  // making createClient() async would ripple through every server caller.
  // Next 16 removes the sync form, so that conversion is due before then.
  const cookieStore = cookies() as unknown as UnsafeUnwrappedCookies;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component — safe to ignore; middleware refreshes the session.
          }
        },
      },
    }
  );
}

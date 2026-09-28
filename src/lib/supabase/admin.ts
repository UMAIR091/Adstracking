import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Use ONLY in trusted server code that
// enforces its own access checks (e.g. public report fetch by unguessable token).
//
// Every request opts out of the Next.js Data Cache. supabase-js reads through
// fetch(), and Next 14 caches fetch() in GET route handlers that never touch
// cookies()/headers() — cron and health routes — with no expiry, even under
// `dynamic = "force-dynamic"`. /api/health served a heartbeat an hour stale
// that way (2026-09-28), and the same would have handed the billing sweep a
// frozen list of subscriptions. Service-role reads must always be live.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

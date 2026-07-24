// Application-layer rate limiting (audit #3).
//
// Backed by the Postgres rate_limit_hit() RPC (migration 0026) — durable across
// serverless invocations and regions, atomic under concurrency, and no extra
// paid infrastructure. Fail-OPEN: if the limiter itself errors (DB blip, missing
// migration) we allow the request rather than take the app down over throttling.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitResult = { allowed: boolean; limit: number; windowSeconds: number };

// Derives a stable client identifier for IP-based limits from the standard proxy
// headers Vercel sets. Falls back to a constant bucket so a missing header can't
// bypass the limit entirely (it just shares one bucket).
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Returns whether the caller is under the limit for `key` in the current window.
export async function rateLimit(
  key: string,
  opts: { limit: number; windowSeconds: number; client?: SupabaseClient }
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = opts;
  const admin = opts.client ?? createAdminClient();
  try {
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) return { allowed: true, limit, windowSeconds }; // fail-open
    return { allowed: data !== false, limit, windowSeconds };
  } catch {
    return { allowed: true, limit, windowSeconds }; // fail-open
  }
}

// Standard 429 response body + Retry-After header.
export function tooManyRequests(windowSeconds: number): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please slow down and try again shortly." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(windowSeconds),
        "Cache-Control": "no-store",
      },
    }
  );
}

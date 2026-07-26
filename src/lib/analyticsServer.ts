// Server-side product analytics (launch audit P0-4). Used for events that
// originate on the server — Paddle webhooks (trial/convert/cancel), OAuth
// callbacks, cron — where there's no browser. Gated on POSTHOG_KEY. Never throws.
import { PostHog } from "posthog-node";
import type { AnalyticsEvent } from "@/lib/analytics";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      // Serverless: send eagerly rather than batching across (short-lived) invocations.
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

// Capture a server event for a known user/agency. distinctId should match the
// client-side identity (the auth user id) so sessions stitch together.
export async function captureServer(
  distinctId: string | null | undefined,
  event: AnalyticsEvent,
  properties?: Record<string, unknown>
): Promise<void> {
  const c = getClient();
  if (!c || !distinctId) return;
  try {
    c.capture({ distinctId, event, properties });
    await c.flush();
  } catch {
    /* analytics must never break the request */
  }
}

// Meta Conversions API: the server half of ad measurement. The browser half is
// lib/metaPixel.ts.
//
// Only one event goes out from here: an agency's FIRST real payment, as a
// Purchase. A trial converts on Paddle's schedule days after checkout, with no
// browser present, so without this the ads would never learn which clicks
// became paying customers. Needs META_CAPI_TOKEN (Events Manager → the dataset
// → Settings → Conversions API → Generate access token); without it every call
// here is a no-op.
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

const PIXEL_ID = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || "1384300833764400";
const GRAPH = `https://graph.facebook.com/${process.env.META_CAPI_API_VERSION || "v23.0"}`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://tryreportflow.com";

// Rows that never led to a payment are dropped after this long.
export const AD_ATTRIBUTION_RETENTION_DAYS = 60;

const ZERO_DECIMAL = new Set(["JPY", "KRW"]);

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

// Called when checkout opens. Stores what Meta needs to attribute a payment
// that may arrive days later. Only runs when the pixel cookies exist, so it
// never records a visitor the pixel was not allowed to measure. Never throws:
// checkout must not fail over ad measurement.
export async function captureAdAttribution(admin: SupabaseClient, agencyId: string): Promise<void> {
  try {
    const jar = cookies();
    const fbp = jar.get("_fbp")?.value ?? null;
    const fbc = jar.get("_fbc")?.value ?? null;
    if (!fbp && !fbc) return;
    const h = headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    const { error } = await admin.from("ad_attribution").upsert(
      {
        agency_id: agencyId,
        fbp,
        fbc,
        client_ip: ip,
        user_agent: h.get("user-agent"),
        captured_at: new Date().toISOString(),
      },
      { onConflict: "agency_id" }
    );
    if (error) console.warn("ad attribution not stored:", error.message);
  } catch (err) {
    console.warn("ad attribution not stored:", (err as Error).message);
  }
}

// Called from the Paddle webhook for every completed transaction. Sends a
// Purchase for the agency's first payment above zero, once: the claim on
// purchase_sent_at makes webhook replays and later renewals no-ops. The event
// id is the Paddle transaction id, matching the browser's Purchase for a
// checkout paid on the spot, so Meta counts the two as one. Never throws.
export async function reportFirstPurchase(
  admin: SupabaseClient,
  args: { agencyId: string; transactionId: string; total: string | null | undefined; currency: string | null | undefined }
): Promise<void> {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return;
  const currency = (args.currency || "USD").toUpperCase();
  const value = Number(args.total ?? 0) / (ZERO_DECIMAL.has(currency) ? 1 : 100);
  if (!(value > 0)) return;

  try {
    const { data: claimed, error } = await admin
      .from("ad_attribution")
      .update({ purchase_sent_at: new Date().toISOString() })
      .eq("agency_id", args.agencyId)
      .is("purchase_sent_at", null)
      .select("fbp, fbc, client_ip, user_agent")
      .maybeSingle();
    if (error || !claimed) return;

    const { data: agency } = await admin
      .from("agencies")
      .select("owner_id, contact_email")
      .eq("id", args.agencyId)
      .maybeSingle();
    const ownerId = (agency?.owner_id as string | undefined) ?? null;
    let signupEmail: string | null = null;
    if (ownerId) {
      const { data } = await admin.auth.admin.getUserById(ownerId);
      signupEmail = data?.user?.email ?? null;
    }
    const emails = Array.from(new Set([signupEmail, agency?.contact_email as string | null].filter(Boolean) as string[]));

    const userData: Record<string, unknown> = {
      em: emails.map(sha256),
      external_id: ownerId ? [sha256(ownerId)] : undefined,
      fbp: claimed.fbp ?? undefined,
      fbc: claimed.fbc ?? undefined,
      client_ip_address: claimed.client_ip ?? undefined,
      client_user_agent: claimed.user_agent ?? undefined,
    };

    const body: Record<string, unknown> = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: args.transactionId,
          action_source: "website",
          event_source_url: `${APP_URL}/dashboard/billing`,
          user_data: userData,
          custom_data: { value, currency },
        },
      ],
      access_token: token,
    };
    if (process.env.META_CAPI_TEST_EVENT_CODE) body.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE;

    const res = await fetch(`${GRAPH}/${PIXEL_ID}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`Meta CAPI Purchase for ${args.transactionId} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
      return;
    }

    // Sent: the identifiers have done their job, so don't keep them.
    await admin
      .from("ad_attribution")
      .update({ fbp: null, fbc: null, client_ip: null, user_agent: null })
      .eq("agency_id", args.agencyId);
  } catch (err) {
    console.error(`Meta CAPI Purchase for ${args.transactionId} failed:`, (err as Error).message);
  }
}

// Daily housekeeping (cron/sync): forget visitors who never paid.
export async function purgeStaleAdAttribution(admin: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - AD_ATTRIBUTION_RETENTION_DAYS * 86_400_000).toISOString();
  await admin.from("ad_attribution").delete().is("purchase_sent_at", null).lt("captured_at", cutoff);
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createPortalUrl, PaddleError } from "@/lib/billing/paddle";

export const runtime = "nodejs";

// Redirects to the Paddle customer portal for the agency's subscription.
// Portal links are signed and short-lived, so we mint a fresh one per click
// instead of storing it.
export async function GET(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.redirect(new URL("/login", req.url));

  const back = (msg: string) =>
    NextResponse.redirect(new URL(`/dashboard/billing?portal_error=${encodeURIComponent(msg)}`, req.url));

  const supabase = createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("provider, provider_customer_id, provider_subscription_id")
    .eq("agency_id", agency.id)
    .maybeSingle();

  if (sub?.provider !== "paddle" || !sub?.provider_customer_id) {
    return back("No subscription to manage yet — choose a plan first.");
  }

  try {
    const url = await createPortalUrl(sub.provider_customer_id, sub.provider_subscription_id);
    return NextResponse.redirect(url);
  } catch (err) {
    return back((err as PaddleError).message);
  }
}

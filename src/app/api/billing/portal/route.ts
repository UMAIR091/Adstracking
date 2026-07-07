import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { getSubscription } from "@/lib/billing/lemonsqueezy";

export const runtime = "nodejs";

// Redirects to the Lemon Squeezy customer portal for the agency's subscription.
// Portal URLs are signed and short-lived, so we fetch a fresh one per click
// instead of storing it.
export async function GET(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.redirect(new URL("/login", req.url));

  const back = (msg: string) =>
    NextResponse.redirect(new URL(`/dashboard/billing?portal_error=${encodeURIComponent(msg)}`, req.url));

  const supabase = createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("provider_subscription_id")
    .eq("agency_id", agency.id)
    .maybeSingle();

  if (!sub?.provider_subscription_id) return back("No subscription to manage yet — choose a plan first.");

  try {
    const ls = await getSubscription(sub.provider_subscription_id);
    return NextResponse.redirect(ls.attributes.urls.customer_portal);
  } catch (err) {
    return back((err as Error).message);
  }
}

import { NextResponse } from "next/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { billingConfigured, findVariant, type BillingInterval, type PlanId } from "@/lib/billing/config";
import { createCheckoutUrl } from "@/lib/billing/lemonsqueezy";

export const runtime = "nodejs";

// Creates a Lemon Squeezy checkout for the requested plan/interval and returns
// its URL. The client redirects; payment happens entirely on LS's hosted page.
export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured yet. Set the LEMONSQUEEZY_* environment variables." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const plan = body?.plan as PlanId | undefined;
  const interval = body?.interval as BillingInterval | undefined;
  if (!plan || !interval || !["monthly", "annual"].includes(interval)) {
    return NextResponse.json({ error: "plan and interval (monthly/annual) are required." }, { status: 400 });
  }

  const variantId = findVariant(plan, interval);
  if (!variantId) return NextResponse.json({ error: "That plan isn't available." }, { status: 400 });

  try {
    const url = await createCheckoutUrl({ variantId, agencyId: agency.id, email: user.email });
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

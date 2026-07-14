import { NextResponse } from "next/server";
import { readWooState } from "@/lib/integrations/oauth/woocommerce";

export const runtime = "nodejs";

// Where WooCommerce sends the store owner's browser after they approve or deny.
// The actual credential storage happens on the callback POST; this route only
// lands the user back on the client page with a success/error flag. WooCommerce
// appends ?success=1|0 and echoes our state as user_id.
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? origin;
  const success = searchParams.get("success");
  const state = searchParams.get("state") ?? searchParams.get("user_id") ?? "";

  let clientId: string | null = null;
  try {
    clientId = readWooState(state).clientId;
  } catch {
    clientId = null;
  }

  if (!clientId) {
    return NextResponse.redirect(`${base}/dashboard/clients?connect_error=${encodeURIComponent("WooCommerce connection failed")}`);
  }
  if (success === "0") {
    return NextResponse.redirect(`${base}/dashboard/clients/${clientId}?connect_error=${encodeURIComponent("WooCommerce access was declined")}`);
  }
  return NextResponse.redirect(`${base}/dashboard/clients/${clientId}?connected=woocommerce`);
}

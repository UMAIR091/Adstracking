import { handleCallback } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Stripe Connect OAuth redirect target (registered in the Stripe Connect settings).
export async function GET(req: Request) {
  return handleCallback(req);
}

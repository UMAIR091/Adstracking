import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Stripe Connect OAuth flow (?clientId=&type=stripe).
export async function GET(req: Request) {
  return handleConnect(req);
}

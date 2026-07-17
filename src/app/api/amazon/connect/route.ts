import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Amazon Ads (Login with Amazon) OAuth flow (?clientId=&type=amazon_ads).
export async function GET(req: Request) {
  return handleConnect(req);
}

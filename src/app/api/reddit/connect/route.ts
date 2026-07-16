import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Reddit Ads OAuth flow (?clientId=&type=reddit_ads).
export async function GET(req: Request) {
  return handleConnect(req);
}

import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the TikTok for Business OAuth flow (?clientId=&type=tiktok_ads).
export async function GET(req: Request) {
  return handleConnect(req);
}

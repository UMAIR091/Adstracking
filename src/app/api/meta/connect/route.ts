import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Meta (Facebook) OAuth flow (?clientId=&type=meta_ads).
export async function GET(req: Request) {
  return handleConnect(req);
}

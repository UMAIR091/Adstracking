import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Pinterest OAuth flow (?clientId=&type=pinterest_ads).
export async function GET(req: Request) {
  return handleConnect(req);
}

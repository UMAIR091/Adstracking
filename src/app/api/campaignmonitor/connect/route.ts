import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Campaign Monitor OAuth flow (?clientId=&type=campaignmonitor).
export async function GET(req: Request) {
  return handleConnect(req);
}

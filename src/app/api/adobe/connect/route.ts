import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Adobe IMS OAuth flow (?clientId=&type=adobe_analytics).
export async function GET(req: Request) {
  return handleConnect(req);
}

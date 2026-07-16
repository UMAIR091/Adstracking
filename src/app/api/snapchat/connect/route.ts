import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Snapchat Marketing API OAuth flow (?clientId=&type=snapchat_ads).
export async function GET(req: Request) {
  return handleConnect(req);
}

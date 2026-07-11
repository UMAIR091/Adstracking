import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the LinkedIn OAuth flow (?clientId=&type=linkedin_ads).
export async function GET(req: Request) {
  return handleConnect(req);
}

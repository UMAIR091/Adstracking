import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the HubSpot OAuth flow (?clientId=&type=hubspot).
export async function GET(req: Request) {
  return handleConnect(req);
}

import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Constant Contact OAuth flow (?clientId=&type=constantcontact).
export async function GET(req: Request) {
  return handleConnect(req);
}

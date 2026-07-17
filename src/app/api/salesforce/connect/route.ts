import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Salesforce OAuth flow (?clientId=&type=salesforce).
export async function GET(req: Request) {
  return handleConnect(req);
}

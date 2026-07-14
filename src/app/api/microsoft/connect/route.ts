import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Microsoft Advertising OAuth flow (?clientId=&type=microsoft_ads).
export async function GET(req: Request) {
  return handleConnect(req);
}

import { handleCallback } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// HubSpot OAuth redirect target (registered in the HubSpot app's auth settings).
export async function GET(req: Request) {
  return handleCallback(req);
}

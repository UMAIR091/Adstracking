import { handleCallback } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Microsoft identity OAuth redirect target (registered in the Azure app).
export async function GET(req: Request) {
  return handleCallback(req);
}

import { handleCallback } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Meta OAuth redirect target (registered in the Meta app's Facebook Login settings).
export async function GET(req: Request) {
  return handleCallback(req);
}

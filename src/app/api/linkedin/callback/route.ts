import { handleCallback } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// LinkedIn OAuth redirect target (registered in the LinkedIn app's auth settings).
export async function GET(req: Request) {
  return handleCallback(req);
}

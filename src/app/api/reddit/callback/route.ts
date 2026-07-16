import { handleCallback } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Reddit OAuth redirect target (registered in the Reddit app). Reddit returns a
// standard ?code=, so the generic callback flow applies directly.
export async function GET(req: Request) {
  return handleCallback(req);
}

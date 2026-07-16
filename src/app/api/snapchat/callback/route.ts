import { handleCallback } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Snapchat OAuth redirect target (registered in the Snapchat app). Snapchat
// returns a standard ?code=, so the generic callback flow applies directly.
export async function GET(req: Request) {
  return handleCallback(req);
}

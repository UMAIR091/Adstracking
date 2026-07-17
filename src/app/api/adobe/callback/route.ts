import { handleCallback } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Adobe IMS OAuth redirect target. Adobe returns a standard ?code=, so the
// generic callback flow applies directly.
export async function GET(req: Request) {
  return handleCallback(req);
}

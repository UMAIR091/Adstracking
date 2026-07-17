import { handleCallback } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Salesforce OAuth redirect target. Returns a standard ?code=, so the generic
// callback flow applies directly.
export async function GET(req: Request) {
  return handleCallback(req);
}

import { handleCallback } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Mailchimp OAuth redirect target (registered in the Mailchimp app settings).
export async function GET(req: Request) {
  return handleCallback(req);
}

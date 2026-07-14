import { handleConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// Starts the Mailchimp OAuth flow (?clientId=&type=mailchimp).
export async function GET(req: Request) {
  return handleConnect(req);
}

import { handleLinkConnect } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A client connect link's "Connect" button: starts the provider sign-in on the
// client's own device (no Anavyst session; the link authorizes it).
export async function GET(req: Request) {
  return handleLinkConnect(req);
}

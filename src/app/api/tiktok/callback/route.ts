import { handleCallback } from "@/lib/integrations/oauthFlow";

export const runtime = "nodejs";

// TikTok OAuth redirect target. TikTok sends the authorization code as
// ?auth_code= — normalize it to ?code= so the generic callback flow applies.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!url.searchParams.get("code") && url.searchParams.get("auth_code")) {
    url.searchParams.set("code", url.searchParams.get("auth_code") as string);
  }
  return handleCallback(new Request(url.toString(), { headers: req.headers }));
}

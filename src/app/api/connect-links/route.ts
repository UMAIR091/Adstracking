import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIntegration } from "@/lib/integrations/registry";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { LINK_TTL_DAYS, hashLinkToken, linkConnectable, linkUrl, newLinkToken } from "@/lib/connectLinks";

export const runtime = "nodejs";

// Creates a client connect link (migration 0048). The link is returned once,
// here: only its hash is stored. Body: { clientId, types: string[] }.
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await rateLimit(`connect-links:${user.id}`, { limit: 30, windowSeconds: 3600 });
  if (!limited.allowed) return tooManyRequests(limited.windowSeconds);

  const body = (await req.json().catch(() => null)) as { clientId?: unknown; types?: unknown } | null;
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  const types = Array.isArray(body?.types)
    ? Array.from(new Set(body.types.filter((t): t is string => typeof t === "string")))
    : [];
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  if (types.length === 0) return NextResponse.json({ error: "Choose at least one platform." }, { status: 400 });
  if (!types.every((t) => linkConnectable(getIntegration(t)))) {
    return NextResponse.json({ error: "One of those platforms can't be connected through a link." }, { status: 400 });
  }

  // RLS: the client must be in the caller's own workspace.
  const { data: client } = await supabase.from("clients").select("id, agency_id, archived").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (client.archived) return NextResponse.json({ error: "Restore this client before sending it a link." }, { status: 400 });

  const token = newLinkToken();
  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: link, error } = await createAdminClient()
    .from("connect_links")
    .insert({
      agency_id: client.agency_id,
      client_id: client.id,
      token_hash: hashLinkToken(token),
      types,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "Couldn't create the link. Please try again." }, { status: 500 });

  return NextResponse.json({ id: link.id, url: linkUrl(token), expiresAt });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Revokes a client connect link: it stops working at once. Connections already
// made through it stay, like any other connection.
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS: only the caller's own workspace's links are visible.
  const { data: link } = await supabase.from("connect_links").select("id, agency_id").eq("id", id).maybeSingle();
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await createAdminClient()
    .from("connect_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", link.id)
    .eq("agency_id", link.agency_id)
    .is("revoked_at", null);
  if (error) return NextResponse.json({ error: "Couldn't revoke the link." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { getIntegration } from "@/lib/integrations/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live sync status for a client's connected sources (journey audit P0-3). The
// client detail page polls this so the user sees real progress instead of a
// silent wait, and the page auto-refreshes the moment data lands. RLS scopes
// the reads to the caller's agency.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user } = await getCurrentUserAndAgency();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const { data } = await supabase
    .from("data_sources")
    .select("type, status, last_synced_at, last_sync_error")
    .eq("client_id", params.id);

  const sources = (data ?? []).map((s) => {
    const def = getIntegration(s.type as string);
    const hasData = Boolean(s.last_synced_at);
    const errored = s.status === "error" || s.status === "revoked" || Boolean(s.last_sync_error);
    return {
      type: s.type as string,
      name: def?.name ?? (s.type as string),
      status: errored ? "error" : hasData ? "ready" : "syncing",
      error: (s.last_sync_error as string | null) ?? null,
    };
  });

  return NextResponse.json(
    {
      sources,
      anyReady: sources.some((s) => s.status === "ready"),
      anySyncing: sources.some((s) => s.status === "syncing"),
      anyError: sources.some((s) => s.status === "error"),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cronAuth";
import { processSources } from "@/lib/syncBatch";
import { logRouteError } from "@/lib/errorLog";
import { loadSyncable } from "@/lib/integrations/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sync worker (perf audit P0). Processes one chunk of already-claimed source ids
// handed to it by the dispatcher (lib/syncDispatch.ts). Many workers run in
// parallel — one Vercel invocation per chunk — which is what lifts total
// throughput beyond a single function's 60s budget. Authorized with CRON_SECRET
// (same guard as the crons) since it's invoked server-to-server.
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? (body!.ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, synced: 0, failed: 0 });

  const admin = createAdminClient();
  try {
    // Each source with its shared sign-in's tokens (migration 0046).
    const sources = await loadSyncable(ids);

    const { synced, failed } = await processSources(admin, sources);
    return NextResponse.json({ ok: true, synced, failed });
  } catch (err) {
    const message = await logRouteError("cron", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

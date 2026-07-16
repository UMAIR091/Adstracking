import { NextResponse } from "next/server";
import { bigQueryContext } from "@/lib/bigquery";
import { syncDataSource, type SyncableSource } from "@/lib/sync";

export const runtime = "nodejs";

// Persists the project → dataset → table selection for a BigQuery connection and
// runs an immediate read-only sync so the snapshot is available without waiting
// for cron. RLS + bigQueryContext enforce tenant isolation.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ctx = await bigQueryContext(body?.dataSourceId);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const projectId: string | undefined = body?.projectId;
  const datasetId: string | null = body?.datasetId ?? null;
  const tableId: string | null = body?.tableId ?? null;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (tableId && !datasetId) return NextResponse.json({ error: "A dataset is required to select a table" }, { status: 400 });

  // account_id keeps the project (readSelected → sync gate); dataset_id/table_id
  // scope the snapshot to one table when chosen.
  const config = { ...(ctx.ds.config ?? {}), account_id: projectId, dataset_id: datasetId, table_id: tableId };
  const { error } = await ctx.supabase.from("data_sources").update({ config }).eq("id", ctx.ds.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  try {
    await syncDataSource(ctx.supabase, { ...ctx.ds, config } as SyncableSource);
  } catch (err) {
    // Selection is saved; report the sync problem so the UI can surface it.
    return NextResponse.json({ ok: true, syncError: (err as Error).message });
  }
  return NextResponse.json({ ok: true });
}

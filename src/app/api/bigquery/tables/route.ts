import { NextResponse } from "next/server";
import { bigQueryContext } from "@/lib/bigquery";
import { listBigQueryTables } from "@/lib/integrations/oauth/bigquery";

export const runtime = "nodejs";

// Read-only table/view discovery within a dataset for the connection's picker.
// RLS + bigQueryContext enforce tenant isolation.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ctx = await bigQueryContext(searchParams.get("dataSourceId"));
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const projectId = searchParams.get("projectId");
  const datasetId = searchParams.get("datasetId");
  if (!projectId || !datasetId) {
    return NextResponse.json({ error: "projectId and datasetId are required" }, { status: 400 });
  }
  try {
    return NextResponse.json({ tables: await listBigQueryTables(ctx.accessToken, projectId, datasetId) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

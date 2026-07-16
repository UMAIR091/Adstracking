import { NextResponse } from "next/server";
import { bigQueryContext } from "@/lib/bigquery";
import { listBigQueryProjects, listBigQueryDatasets } from "@/lib/integrations/oauth/bigquery";

export const runtime = "nodejs";

// Read-only dataset discovery for the connection's picker. With no `projectId`,
// returns the accessible projects instead (used to (re)populate the project
// selector). RLS + bigQueryContext enforce tenant isolation.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ctx = await bigQueryContext(searchParams.get("dataSourceId"));
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const projectId = searchParams.get("projectId");
  try {
    if (!projectId) {
      return NextResponse.json({ projects: await listBigQueryProjects(ctx.accessToken) });
    }
    return NextResponse.json({ datasets: await listBigQueryDatasets(ctx.accessToken, projectId) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

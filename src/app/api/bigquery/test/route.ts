import { NextResponse } from "next/server";
import { bigQueryContext } from "@/lib/bigquery";
import { verifyBigQueryAccess } from "@/lib/integrations/oauth/bigquery";

export const runtime = "nodejs";

// Test Connection: confirms the stored OAuth token still works against BigQuery
// and the account can see at least one project. Returns only a count + names —
// never the token. Read-only.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ctx = await bigQueryContext(body?.dataSourceId);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  try {
    const projects = await verifyBigQueryAccess(ctx.accessToken);
    return NextResponse.json({ ok: true, projectCount: projects.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { requireActiveAccess } from "@/lib/billing/subscription";
import { createClientReport } from "@/lib/reportGen";
import { logError, logRouteError } from "@/lib/errorLog";

export const runtime = "nodejs";

// Generates a unified report from cached GSC + GA4 data. No live Google calls.
export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const clientId: string = body?.clientId;
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const supabase = createClient();
  const blocked = await requireActiveAccess(supabase, agency.id);
  if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status });

  try {
    const result = await createClientReport(supabase, agency.id, clientId, {
      templateKey: body?.templateKey,
      periodDays: body?.periodDays,
    });

    if (!result.ok) {
      // Only a server-side failure (5xx) is worth recording; 4xx are user-fixable
      // (e.g. "connect a data source first") and would just be noise.
      if (result.status >= 500) {
        await logError({ context: "report", agencyId: agency.id, message: result.error });
      }
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    const message = await logRouteError("report", err, { agencyId: agency.id });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

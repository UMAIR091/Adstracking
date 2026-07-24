import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { requireActiveAccess } from "@/lib/billing/subscription";
import { createClientReport } from "@/lib/reportGen";
import { logError, logRouteError } from "@/lib/errorLog";
import { publicError } from "@/lib/errors";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Generates a unified report from cached GSC + GA4 data. No live Google calls.
export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Bound this compute + AI-heavy endpoint per workspace (well above normal use).
  const rl = await rateLimit(`report-gen:${agency.id}`, { limit: 20, windowSeconds: 60 });
  if (!rl.allowed) return tooManyRequests(rl.windowSeconds);

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
    await logRouteError("report", err, { agencyId: agency.id });
    const { error } = publicError(err, "Couldn't generate the report. Please try again.", { route: "reports_generate" });
    return NextResponse.json({ error }, { status: 500 });
  }
}

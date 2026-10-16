import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { isShareAction, newShareToken } from "@/lib/reports/shareLink";

export const runtime = "nodejs";

// Revokes a report's public link (the old URL then 404s) or replaces it with a
// new one. The report is looked up through the caller's own session and agency,
// so only its workspace can change it; the write uses the service role because
// tenants can't update reports directly (migration 0044).
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(`report-share:${agency.id}`, { limit: 30, windowSeconds: 60 });
  if (!rl.allowed) return tooManyRequests(rl.windowSeconds);

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  if (!isShareAction(body?.action)) {
    return NextResponse.json({ error: "action must be \"revoke\" or \"renew\"" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id")
    .eq("id", params.id)
    .eq("agency_id", agency.id)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const shareToken = body.action === "renew" ? newShareToken() : null;
  const { error } = await createAdminClient()
    .from("reports")
    .update({ share_token: shareToken })
    .eq("id", params.id)
    .eq("agency_id", agency.id);
  if (error) return NextResponse.json({ error: "Couldn't update the share link. Please try again." }, { status: 500 });

  return NextResponse.json({ ok: true, shareToken });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { requireActiveAccess } from "@/lib/billing/subscription";
import { emailConfigured } from "@/lib/email";
import { createClientReport } from "@/lib/reportGen";
import { deliverReport } from "@/lib/delivery";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Send Now" and "Send Test Email": generate the latest report for a client and
// email it immediately. mode "test" sends only to the signed-in user; mode "now"
// sends to the schedule's recipients (or the client's email).
export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!emailConfigured()) {
    return NextResponse.json({ error: "Email isn't configured yet. Add RESEND_API_KEY and EMAIL_FROM, then try again." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const clientId: string | undefined = body?.clientId;
  const mode: "now" | "test" = body?.mode === "test" ? "test" : "now";
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const supabase = createClient();
  const blocked = await requireActiveAccess(supabase, agency.id);
  if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status });

  const { data: client } = await supabase.from("clients").select("name, email").eq("id", clientId).eq("agency_id", agency.id).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { data: schedule } = await supabase
    .from("report_schedules").select("recipients, subject, message, template_key").eq("client_id", clientId).maybeSingle();

  let recipients: string[];
  if (mode === "test") {
    recipients = user.email ? [user.email] : [];
  } else {
    const fromSched = Array.isArray(schedule?.recipients) ? (schedule!.recipients as string[]).filter((e) => typeof e === "string" && e.includes("@")) : [];
    recipients = fromSched.length ? fromSched : client.email ? [client.email] : [];
  }
  if (recipients.length === 0) {
    return NextResponse.json({ error: mode === "test" ? "Your account has no email to send the test to." : "No recipients set. Add recipients or the client's email." }, { status: 400 });
  }

  // Generate the latest report from cached data (no live Google calls).
  const gen = await createClientReport(supabase, agency.id, clientId, { templateKey: schedule?.template_key });
  if (!gen.ok) return NextResponse.json({ error: gen.error }, { status: gen.status });

  const subjectBase = schedule?.subject || `${client.name} — your latest performance report`;
  const result = await deliverReport(supabase, {
    agencyId: agency.id,
    branding: { name: agency.name, brand_color: agency.brand_color, website: agency.website, footer_text: agency.footer_text, contact_email: agency.contact_email },
    clientName: client.name,
    recipients,
    subject: mode === "test" ? `[TEST] ${subjectBase}` : subjectBase,
    message: schedule?.message,
    report: { id: gen.id, title: gen.title, shareToken: gen.shareToken, data: gen.data, period: gen.period },
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, sent: result.sent, mode });
}

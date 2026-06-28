import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClientReport } from "@/lib/reportGen";
import { sendEmail, reportEmailHtml, emailConfigured } from "@/lib/email";
import { nextRunAt, isFrequency } from "@/lib/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const key = new URL(req.url).searchParams.get("key");
  return key === secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

// Generates and emails reports for every schedule that's due. Runs daily; each
// schedule advances its own next_run_at so a daily cron honors weekly/monthly/
// quarterly cadences. Generation reads cached snapshots — no live Google calls.
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const { data: due, error } = await admin
    .from("report_schedules")
    .select("id, agency_id, client_id, template_key, frequency, recipients, subject, message")
    .eq("enabled", true)
    .lte("next_run_at", now.toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const sched of due ?? []) {
    processed++;
    const freq = isFrequency(sched.frequency) ? sched.frequency : "monthly";

    const result = await createClientReport(admin, sched.agency_id, sched.client_id, {
      templateKey: sched.template_key,
      periodDays: 28,
    });

    // Advance the schedule regardless, so a failing source doesn't retry every day.
    await admin.from("report_schedules").update({ next_run_at: nextRunAt(freq), updated_at: now.toISOString() }).eq("id", sched.id);

    if (!result.ok) {
      failed++;
      continue;
    }
    if (!emailConfigured()) continue;

    const { data: client } = await admin.from("clients").select("name, email").eq("id", sched.client_id).maybeSingle();
    const fromSched = Array.isArray(sched.recipients) ? (sched.recipients as string[]).filter((e) => typeof e === "string" && e.includes("@")) : [];
    const recipients = fromSched.length ? fromSched : client?.email ? [client.email] : [];
    if (recipients.length === 0) continue;

    const { data: ag } = await admin
      .from("agencies").select("name, brand_color, contact_email").eq("id", sched.agency_id).maybeSingle();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const shareUrl = `${appUrl}/r/${result.shareToken}`;
    const clientName = client?.name ?? "Client";
    const subject = sched.subject || `${clientName} — your latest performance report`;
    const html = reportEmailHtml({
      agencyName: ag?.name ?? "Your Agency",
      brandColor: ag?.brand_color ?? "#4f46e5",
      clientName,
      reportTitle: result.title,
      periodLabel: "the last 28 days",
      shareUrl,
      message: sched.message,
    });

    try {
      const { id: providerId } = await sendEmail({ to: recipients, subject, html, replyTo: ag?.contact_email ?? undefined });
      await admin.from("email_logs").insert(
        recipients.map((to) => ({ agency_id: sched.agency_id, report_id: result.id, to_email: to, subject, provider_id: providerId, status: "sent" }))
      );
      sent++;
    } catch {
      await admin.from("email_logs").insert(
        recipients.map((to) => ({ agency_id: sched.agency_id, report_id: result.id, to_email: to, subject, status: "failed" }))
      );
      failed++;
    }
  }

  return NextResponse.json({ ok: true, processed, sent, failed });
}

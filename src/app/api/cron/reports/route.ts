import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClientReport } from "@/lib/reportGen";
import { cronAuthorized } from "@/lib/cronAuth";
import { deliverReport } from "@/lib/delivery";
import { emailConfigured } from "@/lib/email";
import { nextRunAt, isFrequency } from "@/lib/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Generates and emails reports (branded PDF attachments) for every due schedule.
// Runs daily; each schedule advances its own next_run_at, so a daily cron honors
// weekly/monthly/quarterly cadences with the chosen day + hour. Generation reads
// cached snapshots (no live Google calls); delivery retries transient failures
// and records Sent/Failed in the delivery history.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const { data: due, error } = await admin
    .from("report_schedules")
    .select("id, agency_id, client_id, template_key, frequency, send_day, send_hour, recipients, subject, message")
    .eq("enabled", true)
    .lte("next_run_at", now.toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const sched of due ?? []) {
    processed++;
    const freq = isFrequency(sched.frequency) ? sched.frequency : "monthly";

    const gen = await createClientReport(admin, sched.agency_id, sched.client_id, { templateKey: sched.template_key });

    // Advance regardless, so a failing source doesn't retry every day.
    await admin
      .from("report_schedules")
      .update({ next_run_at: nextRunAt(freq, now, sched.send_day, sched.send_hour), last_run_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", sched.id);

    if (!gen.ok) {
      failed++;
      continue;
    }
    if (!emailConfigured()) continue;

    const { data: client } = await admin.from("clients").select("name, email").eq("id", sched.client_id).maybeSingle();
    const fromSched = Array.isArray(sched.recipients) ? (sched.recipients as string[]).filter((e) => typeof e === "string" && e.includes("@")) : [];
    const recipients = fromSched.length ? fromSched : client?.email ? [client.email] : [];
    if (recipients.length === 0) continue;

    const { data: ag } = await admin
      .from("agencies").select("name, brand_color, website, footer_text, contact_email").eq("id", sched.agency_id).maybeSingle();

    const clientName = client?.name ?? "Client";
    const result = await deliverReport(admin, {
      agencyId: sched.agency_id,
      branding: {
        name: ag?.name ?? "Your Agency",
        brand_color: ag?.brand_color ?? "#4f46e5",
        website: ag?.website ?? null,
        footer_text: ag?.footer_text ?? null,
        contact_email: ag?.contact_email ?? null,
      },
      clientName,
      recipients,
      subject: sched.subject || `${clientName} — your latest performance report`,
      message: sched.message,
      report: { id: gen.id, title: gen.title, shareToken: gen.shareToken, data: gen.data, period: gen.period },
    });

    if (result.ok) sent++;
    else failed++;
  }

  return NextResponse.json({ ok: true, processed, sent, failed });
}

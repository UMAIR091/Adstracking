import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { isFrequency, nextRunAt } from "@/lib/schedule";

export const runtime = "nodejs";

// Creates or replaces the automated-delivery schedule for a client (one per
// client). RLS scopes the writes to the signed-in user's agency.
export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const clientId: string | undefined = body?.clientId;
  const frequency = body?.frequency;
  if (!clientId || !isFrequency(frequency)) {
    return NextResponse.json({ error: "clientId and a valid frequency (weekly/monthly/quarterly) are required." }, { status: 400 });
  }

  const recipients: string[] = Array.isArray(body?.recipients)
    ? body.recipients.filter((e: unknown) => typeof e === "string" && (e as string).includes("@"))
    : [];
  const enabled = body?.enabled !== false;
  const templateKey = body?.templateKey || "seo";
  const subject = body?.subject?.trim() || null;
  const message = body?.message?.trim() || null;
  const sendDay = Number.isFinite(body?.sendDay) ? Number(body.sendDay) : null;
  const sendHour = Number.isFinite(body?.sendHour) ? Number(body.sendHour) : 8;

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // One schedule per client — replace any existing.
  await supabase.from("report_schedules").delete().eq("client_id", clientId);
  const { error } = await supabase.from("report_schedules").insert({
    agency_id: agency.id,
    client_id: clientId,
    template_key: templateKey,
    frequency,
    send_day: sendDay,
    send_hour: sendHour,
    next_run_at: nextRunAt(frequency, new Date(), sendDay, sendHour),
    recipients,
    subject,
    message,
    enabled,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

// Removes a client's schedule.
export async function DELETE(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const supabase = createClient();
  const { error } = await supabase.from("report_schedules").delete().eq("client_id", clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

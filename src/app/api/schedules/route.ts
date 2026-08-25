import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { requireActiveAccess, getSubscriptionState } from "@/lib/billing/subscription";
import { featuresForPlan } from "@/lib/billing/config";
import { isFrequency, isSchedulePeriod, nextRunAt } from "@/lib/schedule";

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
    return NextResponse.json({ error: "clientId and a valid frequency (daily/weekly/biweekly/monthly/quarterly) are required." }, { status: 400 });
  }

  const recipients: string[] = Array.isArray(body?.recipients)
    ? body.recipients
        .filter((e: unknown) => typeof e === "string" && (e as string).includes("@"))
        .slice(0, 10) // sanity cap — schedules email a handful of stakeholders, not lists
    : [];
  const enabled = body?.enabled !== false;
  const templateKey = body?.templateKey || "seo";
  const subject = typeof body?.subject === "string" ? body.subject.trim().slice(0, 200) || null : null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) || null : null;
  // Clamp to what nextRunAt understands: hour 0-23 UTC; day = weekday 0-6 for
  // weekly, day-of-month 1-28 for monthly/quarterly. Daily has no day to pick,
  // so it is stored as null rather than a number that would mean nothing.
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.trunc(n)));
  const dayRange: [number, number] = frequency === "weekly" || frequency === "biweekly" ? [0, 6] : [1, 28];
  const sendDay =
    frequency === "daily" ? null
      : Number.isFinite(body?.sendDay) ? clamp(Number(body.sendDay), dayRange[0], dayRange[1])
      : null;
  const sendHour = Number.isFinite(body?.sendHour) ? clamp(Number(body.sendHour), 0, 23) : 8;
  // The window this schedule reports on. Anything unrecognised — including
  // "custom", which cannot recur — falls back to null, meaning "match the
  // frequency" (lib/schedule.ts periodForSchedule).
  const period = isSchedulePeriod(body?.period) ? body.period : null;

  const supabase = createClient();
  const blocked = await requireActiveAccess(supabase, agency.id);
  if (blocked) return NextResponse.json({ error: blocked.error }, { status: blocked.status });

  // Automated delivery is the line between free and paid. Enforced here rather
  // than only in the UI, so a direct POST can't schedule from a free account.
  const state = await getSubscriptionState(supabase, agency.id);
  if (!featuresForPlan(state.plan).scheduledDelivery) {
    return NextResponse.json(
      { error: "Scheduled delivery isn't included on the Free plan. Upgrade to send reports automatically." },
      { status: 402 }
    );
  }

  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // One schedule per client — replace any existing.
  await supabase.from("report_schedules").delete().eq("client_id", clientId);
  const { error } = await supabase.from("report_schedules").insert({
    agency_id: agency.id,
    client_id: clientId,
    template_key: templateKey,
    frequency,
    period,
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

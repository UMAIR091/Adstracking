// Robust, idempotent scheduled-report delivery engine (audit #1, Critical).
//
// Replaces the old "load every due schedule and process sequentially in one 60s
// request, advancing next_run_at after sending" loop, which could time out
// (silently skipping schedules) and double-send on a mid-flight crash.
//
// Design:
//   • BOUNDED per run (SCHEDULE_BATCH_SIZE) so a run never risks the 60s wall.
//   • ATOMIC CLAIM. claim_due_schedules() (SKIP LOCKED + a unique per-occurrence
//     ledger row in report_deliveries) hands each occurrence to exactly one
//     worker; overlapping cron runs claim disjoint sets. next_run_at is advanced
//     immediately after claiming, so scheduling never stalls or piles up.
//   • IDEMPOTENT. The ledger row is the occurrence's identity. A replay or a
//     concurrent run can't re-claim it (ON CONFLICT DO NOTHING), so a report is
//     never sent twice by normal operation.
//   • NO SKIPS. claim_stuck_deliveries() atomically re-claims occurrences a
//     crashed/failed run left mid-flight (up to MAX_ATTEMPTS), so a transient
//     failure or timeout is retried on the next run rather than lost.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSubscriptionState } from "@/lib/billing/subscription";
import { createClientReport } from "@/lib/reportGen";
import { deliverReport } from "@/lib/delivery";
import { emailConfigured } from "@/lib/email";
import { nextRunAt, isFrequency } from "@/lib/schedule";
import { logError } from "@/lib/errorLog";

const MAX_ATTEMPTS = 3;
const STUCK_MINUTES = 15;

export function scheduleBatchSize(): number {
  const n = Number(process.env.SCHEDULE_BATCH_SIZE);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
}

// A unit of work: one schedule occurrence to generate + deliver, tied to its
// ledger row. Produced identically by the fresh-claim and stuck-retry RPCs.
type DeliveryJob = {
  delivery_id: string;
  schedule_id: string;
  agency_id: string;
  client_id: string;
  template_key: string | null;
  frequency: string | null;
  send_day: number | null;
  send_hour: number | null;
  recipients: unknown;
  subject: string | null;
  message: string | null;
  occurrence_at: string;
  attempts?: number;
};

export type ScheduleRunResult = { processed: number; sent: number; failed: number; skipped: number };

// Marks a ledger row's terminal state. Best-effort — the row already exists.
async function finalize(
  admin: SupabaseClient,
  deliveryId: string,
  patch: { status: "sent" | "failed" | "skipped"; report_id?: string | null; error?: string | null }
): Promise<void> {
  await admin.from("report_deliveries").update(patch).eq("id", deliveryId);
}

// Advances a schedule's next_run_at from NOW (not from the missed occurrence),
// so a late run doesn't replay a backlog of past occurrences. Done right after
// claiming, before any send, so scheduling can never stall.
async function advanceSchedule(admin: SupabaseClient, job: DeliveryJob, now: Date): Promise<void> {
  const freq = isFrequency(job.frequency) ? job.frequency : "monthly";
  await admin
    .from("report_schedules")
    .update({
      next_run_at: nextRunAt(freq, now, job.send_day, job.send_hour),
      last_run_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", job.schedule_id);
}

// Generates + emails one claimed occurrence and records the outcome on its
// ledger row. Never throws.
async function processJob(admin: SupabaseClient, job: DeliveryJob, allowed: boolean): Promise<"sent" | "failed" | "skipped"> {
  if (!allowed) {
    await finalize(admin, job.delivery_id, { status: "skipped", error: "subscription inactive" });
    return "skipped";
  }

  let gen;
  try {
    gen = await createClientReport(admin, job.agency_id, job.client_id, { templateKey: job.template_key ?? undefined });
  } catch (err) {
    await finalize(admin, job.delivery_id, { status: "failed", error: (err as Error).message.slice(0, 500) });
    await logError({ context: "report", agencyId: job.agency_id, message: (err as Error).message, retryStatus: "will_retry" });
    return "failed";
  }

  if (!gen.ok) {
    await finalize(admin, job.delivery_id, { status: "failed", error: gen.error.slice(0, 500) });
    await logError({ context: "report", agencyId: job.agency_id, message: gen.error, retryStatus: "will_retry" });
    return "failed";
  }

  if (!emailConfigured()) {
    // Report generated but delivery isn't configured — record it and don't retry
    // forever on a config gap.
    await finalize(admin, job.delivery_id, { status: "skipped", report_id: gen.id, error: "email not configured" });
    return "skipped";
  }

  const [{ data: client }, { data: ag }] = await Promise.all([
    admin.from("clients").select("name, email").eq("id", job.client_id).maybeSingle(),
    admin.from("agencies").select("name, brand_color, website, footer_text, contact_email, logo_url, email_footer").eq("id", job.agency_id).maybeSingle(),
  ]);

  const fromSched = Array.isArray(job.recipients) ? (job.recipients as unknown[]).filter((e): e is string => typeof e === "string" && e.includes("@")) : [];
  const recipients = fromSched.length ? fromSched : client?.email ? [client.email] : [];
  if (recipients.length === 0) {
    await finalize(admin, job.delivery_id, { status: "skipped", report_id: gen.id, error: "no recipients" });
    return "skipped";
  }

  const clientName = client?.name ?? "Client";
  const result = await deliverReport(admin, {
    agencyId: job.agency_id,
    branding: {
      name: ag?.name ?? "Your Agency",
      brand_color: ag?.brand_color ?? "#4f46e5",
      website: ag?.website ?? null,
      footer_text: ag?.footer_text ?? null,
      contact_email: ag?.contact_email ?? null,
      logo_url: ag?.logo_url ?? null,
      email_footer: ag?.email_footer ?? null,
    },
    clientName,
    recipients,
    subject: job.subject || `${clientName} — your latest performance report`,
    message: job.message,
    report: { id: gen.id, title: gen.title, shareToken: gen.shareToken, data: gen.data, period: gen.period },
  });

  if (result.ok) {
    await finalize(admin, job.delivery_id, { status: "sent", report_id: gen.id, error: null });
    return "sent";
  }
  await finalize(admin, job.delivery_id, { status: "failed", report_id: gen.id, error: (result.error ?? "delivery failed").slice(0, 500) });
  return "failed";
}

// Runs one bounded batch: fresh due occurrences + stuck-retry occurrences.
// Access is resolved once per agency (cached) across both sets.
export async function runScheduledReports(admin: SupabaseClient, limit = scheduleBatchSize()): Promise<ScheduleRunResult> {
  const now = new Date();
  const result: ScheduleRunResult = { processed: 0, sent: 0, failed: 0, skipped: 0 };

  const [{ data: fresh, error: freshErr }, { data: stuck }] = await Promise.all([
    admin.rpc("claim_due_schedules", { p_limit: limit }),
    admin.rpc("claim_stuck_deliveries", { p_limit: limit, p_stuck_minutes: STUCK_MINUTES, p_max_attempts: MAX_ATTEMPTS }),
  ]);
  if (freshErr) throw new Error(freshErr.message);

  const freshJobs = (fresh ?? []) as DeliveryJob[];
  const stuckJobs = (stuck ?? []) as DeliveryJob[];

  // Advance schedules for the freshly-claimed occurrences up front (before any
  // send) so scheduling can't stall. Stuck retries reuse an already-advanced
  // schedule, so they are not advanced again.
  await Promise.all(freshJobs.map((job) => advanceSchedule(admin, job, now)));

  const accessCache = new Map<string, boolean>();
  const access = async (agencyId: string): Promise<boolean> => {
    const cached = accessCache.get(agencyId);
    if (cached !== undefined) return cached;
    const allowed = (await getSubscriptionState(admin, agencyId)).hasAccess;
    accessCache.set(agencyId, allowed);
    return allowed;
  };

  for (const job of [...freshJobs, ...stuckJobs]) {
    result.processed++;
    const outcome = await processJob(admin, job, await access(job.agency_id));
    result[outcome]++;
  }

  return result;
}

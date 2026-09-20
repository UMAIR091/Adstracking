// Robust, idempotent scheduled-report delivery engine (audit #1, Critical).
//
// Replaces the old "load every due schedule and process sequentially in one 60s
// request, advancing next_run_at after sending" loop, which could time out
// (silently skipping schedules) and double-send on a mid-flight crash.
//
// Design:
//   • BOUNDED per run (SCHEDULE_BATCH_SIZE) to what a run can actually FINISH,
//     backed by a wall-clock budget (runBudgetMs). The bound used to be 50,
//     which a 60s function running ~15s jobs sequentially could never complete;
//     the surplus was claimed, advanced past, and stranded.
//   • ATOMIC CLAIM. claim_due_schedules() (SKIP LOCKED + a unique per-occurrence
//     ledger row in report_deliveries) hands each occurrence to exactly one
//     worker; overlapping cron runs claim disjoint sets. next_run_at is advanced
//     immediately after claiming, so scheduling never stalls or piles up.
//   • IDEMPOTENT. The ledger row is the occurrence's identity. A replay or a
//     concurrent run can't re-claim it (ON CONFLICT DO NOTHING), so a report is
//     never sent twice by normal operation.
//   • NO SKIPS. claim_stuck_deliveries() atomically re-claims occurrences a
//     crashed/failed run left mid-flight (up to MAX_ATTEMPTS), so a transient
//     failure or timeout is retried on the next run rather than lost. Retries
//     are claimed and processed BEFORE new work, so a backlog drains instead of
//     queueing behind every fresh occurrence forever.
//   • VISIBLE. Whatever a run claims but cannot start is reported as `deferred`
//     and carried into the cron heartbeat, so a backlog shows up in /api/health
//     instead of being indistinguishable from a clean run.
//
// NOTE ON CADENCE: the retry design assumes this cron runs every few minutes
// (see vercel.json). claim_stuck_deliveries only runs when the cron runs, and
// only considers rows created within the last 24h, so on a once-a-day schedule
// retries were effectively dead on arrival.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSubscriptionState } from "@/lib/billing/subscription";
import { featuresForPlan } from "@/lib/billing/config";
import { pausedClientIds } from "@/lib/archivedClients";
import { createClientReport } from "@/lib/reportGen";
import { deliverReport } from "@/lib/delivery";
import { emailConfigured } from "@/lib/email";
import { nextRunAt, isFrequency, periodForSchedule } from "@/lib/schedule";
import { logError } from "@/lib/errorLog";

const MAX_ATTEMPTS = 3;
const STUCK_MINUTES = 15;

// How many occurrences one run may CLAIM. This defaulted to 50, which the batch
// could not honour: a job is createClientReport (a ~15s AI call on every paid
// plan) plus a PDF render plus an email, run sequentially inside a 60s function,
// so a run finishes a handful and is killed. The other ~45 were claimed, had
// their schedule advanced, and were left as 'claimed' ledger rows — invisible,
// and burning a retry attempt each time they were re-claimed without being
// reached. The bound is now what a run can actually complete; runBudgetMs() is
// the safety net underneath it.
export function scheduleBatchSize(): number {
  const n = Number(process.env.SCHEDULE_BATCH_SIZE);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

// Wall-clock budget for starting new jobs, comfortably inside the 60s function
// limit. Claiming the right number is the real fix; this stops an unusually slow
// job from dragging the run past the wall and stranding whatever follows it.
export function runBudgetMs(): number {
  const n = Number(process.env.SCHEDULE_RUN_BUDGET_MS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50_000;
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
  /** The window this schedule pins itself to; null = match the frequency. */
  period: string | null;
  attempts?: number;
};

// `deferred` counts occurrences this run claimed but ran out of budget to
// start. It exists so a backlog is VISIBLE: previously unreached jobs moved no
// counter at all, so a run that delivered 3 of 50 reported "sent 3 failed 0"
// and /api/health showed the job green.
export type ScheduleRunResult = { processed: number; sent: number; failed: number; skipped: number; deferred: number };

// Marks a ledger row's terminal state. Best-effort — the row already exists.
async function finalize(
  admin: SupabaseClient,
  deliveryId: string,
  patch: { status: "sent" | "failed" | "skipped"; report_id?: string | null; error?: string | null }
): Promise<void> {
  // Swallowed deliberately. This was unguarded, so a transient error writing a
  // ledger row escaped processJob — whose contract is "never throws" — and took
  // down runScheduledReports, abandoning every remaining job in the batch after
  // their schedules had already been advanced. Losing the terminal status of one
  // delivery is recoverable (the row stays claimed and is retried); losing the
  // rest of the batch is not.
  try {
    await admin.from("report_deliveries").update(patch).eq("id", deliveryId);
  } catch {
    /* the row keeps its current status and is picked up by the stuck-retry path */
  }
}

// Advances a schedule's next_run_at from NOW (not from the missed occurrence),
// so a late run doesn't replay a backlog of past occurrences. Done right after
// claiming, before any send, so scheduling can never stall.
async function advanceSchedule(admin: SupabaseClient, job: DeliveryJob, now: Date): Promise<void> {
  const freq = isFrequency(job.frequency) ? job.frequency : "monthly";
  // Guarded for the same reason as finalize: these run inside a Promise.all
  // BEFORE any job is processed, so one rejection threw the whole run away with
  // every occurrence already claimed. A schedule that fails to advance is
  // re-claimed on a later run; the ledger's unique (schedule_id, occurrence_at)
  // row is what stops it being delivered twice.
  try {
    await admin
      .from("report_schedules")
      .update({
        next_run_at: nextRunAt(freq, now, job.send_day, job.send_hour),
        last_run_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", job.schedule_id);
  } catch {
    /* re-claimed later; the ledger row prevents a double send */
  }
}

// Generates + emails one claimed occurrence and records the outcome on its
// ledger row. Never throws. `blocked` is why the agency may not receive it, or
// null when it may.
async function processJob(admin: SupabaseClient, job: DeliveryJob, blocked: string | null): Promise<"sent" | "failed" | "skipped"> {
  try {
    return await runJob(admin, job, blocked);
  } catch (err) {
    // Last resort, and the reason the contract above is absolute: this is awaited
    // inside a plain loop, so anything escaping here abandons every job after it.
    // Only createClientReport was wrapped; the ledger writes, the client/agency
    // reads and deliverReport were not.
    const message = (err as Error)?.message ?? "unknown error";
    try {
      await finalize(admin, job.delivery_id, { status: "failed", error: message.slice(0, 500) });
      await logError({ context: "report", agencyId: job.agency_id, message, retryStatus: "will_retry" });
    } catch {
      /* the row stays claimed and is retried; nothing further to record */
    }
    return "failed";
  }
}

async function runJob(admin: SupabaseClient, job: DeliveryJob, blocked: string | null): Promise<"sent" | "failed" | "skipped"> {
  if (blocked) {
    await finalize(admin, job.delivery_id, { status: "skipped", error: blocked });
    return "skipped";
  }

  let gen;
  try {
    // Match the reporting window to the delivery cadence. This used to pass no
    // period at all, so a QUARTERLY schedule delivered a 28-day report — the
    // default — three months apart, leaving two thirds of the quarter unreported.
    //
    // The schedule's own window when it pins one, otherwise the cadence
    // default: weekly the previous 7 days, biweekly the previous 14, monthly
    // the previous CALENDAR month and quarterly the previous CALENDAR quarter —
    // so "your August report" covers August, not 28 rolling days ending
    // mid-month. Windows other than the cached 28/90 are rebuilt from the
    // 90-day daily series inside createClientReport.
    const freq = isFrequency(job.frequency) ? job.frequency : "monthly";
    gen = await createClientReport(admin, job.agency_id, job.client_id, {
      templateKey: job.template_key ?? undefined,
      period: periodForSchedule(freq, job.period),
    });
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
    admin.from("clients").select("name, email, logo_url").eq("id", job.client_id).maybeSingle(),
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
    clientLogoUrl: client?.logo_url ?? null,
    recipients,
    subject: job.subject || `${clientName} — your latest performance report`,
    message: job.message,
    // The scheduler sent this with no human in the loop — the only path that
    // records "scheduled".
    source: "scheduled",
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
  const deadline = Date.now() + runBudgetMs();
  const result: ScheduleRunResult = { processed: 0, sent: 0, failed: 0, skipped: 0, deferred: 0 };

  // Retries are claimed FIRST, and count against the same budget as new work.
  //
  // They used to be claimed in parallel with a full batch of fresh occurrences
  // and appended AFTER them, so in a run that only finishes a few jobs the
  // backlog was never reached at all — it could not drain, however many runs
  // went by, while each re-claim burned one of its three attempts. Capping them
  // at half the batch keeps the reverse from happening: a persistent backlog
  // can't starve schedules that are due now.
  const stuckLimit = Math.max(1, Math.floor(limit / 2));
  const { data: stuck } = await admin.rpc("claim_stuck_deliveries", {
    p_limit: stuckLimit,
    p_stuck_minutes: STUCK_MINUTES,
    p_max_attempts: MAX_ATTEMPTS,
  });
  const stuckJobs = (stuck ?? []) as DeliveryJob[];

  // Claim only the remaining capacity. Over-claiming was the root of the damage:
  // an unreached occurrence has already had its schedule advanced, so it exists
  // only as a ledger row, and every run that claimed it without reaching it
  // spent one of its attempts.
  const freshLimit = Math.max(0, limit - stuckJobs.length);
  let freshJobs: DeliveryJob[] = [];
  if (freshLimit > 0) {
    const { data: fresh, error: freshErr } = await admin.rpc("claim_due_schedules", { p_limit: freshLimit });
    if (freshErr) throw new Error(freshErr.message);
    freshJobs = (fresh ?? []) as DeliveryJob[];
  }

  const jobs = [...stuckJobs, ...freshJobs];

  // Archived clients are paused (lib/archivedClients.ts), so their deliveries
  // are skipped. Read once for the whole batch, before any schedule is
  // advanced: if the state can't be read, the run fails loudly (the cron
  // records it) instead of delivering for a client that may be archived.
  const pausedClients = await pausedClientIds(admin, jobs.map((job) => job.client_id));

  // Advance schedules for the freshly-claimed occurrences up front (before any
  // send) so scheduling can't stall. Stuck retries reuse an already-advanced
  // schedule, so they are not advanced again.
  await Promise.all(freshJobs.map((job) => advanceSchedule(admin, job, now)));

  // The plan is checked here, at delivery, not only when the schedule was
  // saved: an agency that has since dropped to Free keeps its schedule rows,
  // and a schedule row on its own must never be enough to get paid delivery.
  const planCache = new Map<string, string | null>();
  const blockedReason = async (job: DeliveryJob): Promise<string | null> => {
    if (pausedClients.has(job.client_id)) return "client archived";
    if (planCache.has(job.agency_id)) return planCache.get(job.agency_id) ?? null;
    const state = await getSubscriptionState(admin, job.agency_id);
    const reason = !state.hasAccess
      ? "subscription inactive"
      : featuresForPlan(state.plan).scheduledDelivery
        ? null
        : "plan excludes scheduled delivery";
    planCache.set(job.agency_id, reason);
    return reason;
  };

  for (let i = 0; i < jobs.length; i++) {
    // Stop STARTING work once the budget is spent, and say how much was left.
    // `i > 0` guarantees a run always attempts at least one job, so progress is
    // made even if the budget is somehow already gone on entry.
    if (i > 0 && Date.now() >= deadline) {
      result.deferred = jobs.length - i;
      break;
    }
    result.processed++;
    const outcome = await processJob(admin, jobs[i], await blockedReason(jobs[i]));
    result[outcome]++;
  }

  return result;
}

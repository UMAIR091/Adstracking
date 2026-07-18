// Centralized error capture. Every subsystem (API routes, OAuth callbacks,
// integration sync, report generation, cron) funnels failures through logError,
// which does two things and NEVER throws:
//
//   1. console.error a structured, single-line record — this lands in Vercel's
//      centralized function logs (searchable/alertable there), the platform's
//      built-in log drain. No external APM is introduced.
//   2. Best-effort append to the sync_errors table (via the service-role key, so
//      it works from any context regardless of the caller's session), giving an
//      in-app, agency-scoped history the dashboard can render.
//
// Failures here are swallowed on purpose: monitoring must never take down the
// path it's monitoring.
import { createAdminClient } from "@/lib/supabase/admin";

export type ErrorContext = "sync" | "oauth_callback" | "report" | "cron" | "api_route";
export type ErrorType = "reauth" | "transient" | "config" | "unexpected";
export type RetryStatus = "will_retry" | "needs_reconnect" | "exhausted" | "none";

export type ErrorEvent = {
  context: ErrorContext;
  message: string;
  // Workspace the error belongs to. When absent (e.g. a batch-level cron crash
  // before any agency is resolved) the event is logged to the console only —
  // the table is agency-scoped by design.
  agencyId?: string | null;
  dataSourceId?: string | null;
  provider?: string | null;
  errorType?: ErrorType;
  retryStatus?: RetryStatus | null;
};

const MAX_MESSAGE = 2000;

function normalize(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function logError(event: ErrorEvent): Promise<void> {
  const message = (event.message ?? "").slice(0, MAX_MESSAGE);
  const errorType: ErrorType = event.errorType ?? "unexpected";

  // (1) Always emit to the platform log stream.
  try {
    console.error(
      "[error]",
      JSON.stringify({
        context: event.context,
        provider: event.provider ?? null,
        errorType,
        retryStatus: event.retryStatus ?? null,
        agencyId: event.agencyId ?? null,
        dataSourceId: event.dataSourceId ?? null,
        message,
      })
    );
  } catch {
    /* logging must never throw */
  }

  // (2) Best-effort structured history (requires an agency to scope the row).
  if (!event.agencyId) return;
  try {
    const admin = createAdminClient();
    await admin.from("sync_errors").insert({
      agency_id: event.agencyId,
      data_source_id: event.dataSourceId ?? null,
      context: event.context,
      provider: event.provider ?? null,
      error_type: errorType,
      message,
      retry_status: event.retryStatus ?? null,
    });
  } catch {
    // Table missing (migration not yet applied), transient DB error, etc.
    // Swallow — the console.error above is the durable record.
  }
}

// Convenience wrapper for API-route handlers: logs an unexpected throw against a
// workspace and returns its message, so callers can respond with a 500.
export async function logRouteError(
  context: ErrorContext,
  err: unknown,
  meta: { agencyId?: string | null; provider?: string | null } = {}
): Promise<string> {
  const message = normalize(err);
  await logError({ context, message, agencyId: meta.agencyId ?? null, provider: meta.provider ?? null });
  return message;
}

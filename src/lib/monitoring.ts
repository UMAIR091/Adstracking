// Production monitoring seam (audit #5).
//
// A single place every subsystem reports exceptions to. Today it emits a
// structured, single-line record to stderr, which lands in Vercel's centralized
// function logs (searchable + alertable there) — no paid infrastructure
// required. It is *Sentry-ready*: when an external reporter is registered (see
// below) every captured error is also forwarded to it, so adopting Sentry (or
// any APM) is a wiring change with zero call-site edits.
//
// To enable Sentry later, WITHOUT touching any of the code that calls
// captureException:
//   1. `npm i @sentry/nextjs`
//   2. Create `instrumentation.ts` at the project root that calls
//      `Sentry.init({ dsn: process.env.SENTRY_DSN })` and then
//      `registerErrorReporter((err, ctx) => Sentry.captureException(err, { extra: ctx }))`.
// Until then this is a safe no-op beyond the console record.

export type ErrorReporter = (error: unknown, context?: Record<string, unknown>) => void;

let externalReporter: ErrorReporter | null = null;

// Registered once at startup by instrumentation code when an APM is configured.
export function registerErrorReporter(reporter: ErrorReporter): void {
  externalReporter = reporter;
}

// Whether an external monitor is wired up — surfaced by the health check so ops
// can confirm alerting is live in each environment.
export function monitoringConfigured(): boolean {
  return externalReporter !== null || Boolean(process.env.SENTRY_DSN);
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// Report an exception. Never throws — monitoring must not take down the path it
// monitors.
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  try {
    console.error(
      "[exception]",
      JSON.stringify({
        message: toMessage(error),
        stack: error instanceof Error ? error.stack?.split("\n").slice(0, 4).join(" | ") : undefined,
        ...context,
      })
    );
  } catch {
    /* ignore */
  }
  try {
    externalReporter?.(error, context);
  } catch {
    /* a broken reporter must never break the request */
  }
}

// Next.js instrumentation hook — loads the right Sentry init per runtime and
// forwards nested React Server Component request errors to Sentry.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in server components / route handlers (Next 14.2+/v10).
export const onRequestError = Sentry.captureRequestError;

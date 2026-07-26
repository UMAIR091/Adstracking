// Sentry — server runtime. Gated on SENTRY_DSN so it's a clean no-op until the
// DSN is set (then it captures automatically). Wires the app's existing
// monitoring seam (lib/monitoring) so every logError()/captureException() flows
// to Sentry too, without changing any call site.
import * as Sentry from "@sentry/nextjs";
import { registerErrorReporter } from "@/lib/monitoring";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Low default trace sampling — raise via env if you want more performance data.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    // Don't send default PII (IP, cookies); we attach only the safe context we choose.
    sendDefaultPii: false,
  });

  registerErrorReporter((error, context) => {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  });
}

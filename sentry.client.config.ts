// Sentry — browser runtime. Gated on the public DSN so it's a no-op until set.
// Captures unhandled client errors. Session Replay is intentionally NOT enabled:
// it's a large client bundle and would erase the app's bundle-size wins. Enable
// it later per-route via a lazy import if you want replays on specific flows.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    sendDefaultPii: false,
  });
}

"use client";

// Error boundary for the dashboard. A thrown server/client error inside any
// dashboard route renders this instead of a raw crash page — a friendly,
// recoverable state with a one-click retry (reset re-runs the failed segment).
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaced in the browser console + any client APM. The digest correlates
    // to the full server-side stack in the platform logs.
    console.error("[dashboard-error]", error.digest ?? "", error.message);
    // This boundary catches dashboard errors before global-error.tsx can, and
    // that one only fires for root-layout failures — so without this, the whole
    // signed-in surface reported nothing. No-op until a DSN is configured.
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-50 text-warning-600 ring-1 ring-inset ring-warning-100">
        <AlertTriangle size={26} />
      </div>
      <h1 className="mt-5 text-lg font-semibold text-ink-900">Something went wrong</h1>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
        We hit an unexpected error loading this page. Your data is safe — this is usually temporary. Try again, and if it
        keeps happening, let us know.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-ink-500">Reference: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

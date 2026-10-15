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
    <div role="alert" className="mx-auto mt-[10vh] flex max-w-lg flex-col items-center rounded-card border border-danger-100 bg-surface px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger-50 text-danger-600">
        <AlertTriangle size={22} />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-ink-900">Something went wrong</h1>
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
          <Link href="/dashboard">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}

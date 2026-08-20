"use client";

// Root error boundary — catches unexpected errors on any route outside the
// dashboard (marketing, auth, public report pages) so they get a branded,
// recoverable screen instead of a raw crash.
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-50 text-warning-600 ring-1 ring-inset ring-warning-100">
        <AlertTriangle size={26} />
      </div>
      <h1 className="mt-5 text-lg font-semibold text-ink-900">Something went wrong</h1>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
        An unexpected error occurred. It&apos;s usually temporary — please try again.
      </p>
      {error.digest && <p className="mt-2 text-xs text-ink-500">Reference: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}

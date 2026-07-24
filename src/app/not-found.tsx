import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

// Global 404 — a branded, helpful dead-end rather than a stark default.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
        <Compass size={26} />
      </div>
      <p className="mt-5 text-sm font-medium text-brand-600">404</p>
      <h1 className="mt-1 text-xl font-semibold text-ink-900">Page not found</h1>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
        The page you’re looking for doesn’t exist or may have moved.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}

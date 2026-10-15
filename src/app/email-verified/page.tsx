import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Brand } from "@/components/Brand";
import { safeNext } from "@/lib/safeNext";

export const metadata = { title: "Email verified · Anavyst", robots: { index: false } };

// Where a signup confirmation link lands when it's opened in a browser other
// than the one that signed up (see /auth/callback and lib/signupMarker). The
// signup window continues into setup by itself, so this one only confirms.
export default function EmailVerifiedPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNext(searchParams.next);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center"><Brand className="text-lg" /></Link>
        <div className="rounded-2xl border border-ink-200 bg-surface p-7 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-600">
            <CheckCircle2 size={24} />
          </div>
          <h1 className="text-xl font-semibold text-ink-900">Your email is verified</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Go back to the window where you created your account. It continues by itself, and you can close this page.
          </p>
          {/* Fallback for when the signup window is gone (closed laptop, killed
              tab): this browser already holds the session. */}
          <p className="mt-6 text-xs text-ink-500">
            Closed that window?{" "}
            <Link href={next} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
              Continue on this device <ArrowRight size={12} />
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

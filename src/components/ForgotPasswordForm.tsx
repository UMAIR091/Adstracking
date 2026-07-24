"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/Brand";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

// "Forgot password" — sends a reset link. The link routes through /auth/callback
// (which exchanges the recovery code for a session) and on to /reset-password.
export function ForgotPasswordForm() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    // Always show success — never reveal whether an email is registered.
    if (error && !/rate/i.test(error.message)) return setError(error.message);
    setSent(true);
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <Link href="/" className="mb-8 flex justify-center">
        <Brand className="text-lg" />
      </Link>
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <MailCheck size={22} />
            </div>
            <h1 className="text-xl font-semibold text-ink-900">Check your email</h1>
            <p className="mb-1 mt-2 text-sm leading-relaxed text-ink-500">
              If an account exists for <span className="font-medium text-ink-700">{email}</span>, we&apos;ve sent a link to
              reset your password. It expires in an hour.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-ink-900">Reset your password</h1>
            <p className="mb-5 mt-1 text-sm text-ink-500">Enter your email and we&apos;ll send you a reset link.</p>
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-700">Email</label>
                <input id="email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
      </div>
      <p className="mt-5 text-center text-sm text-ink-500">
        <Link href="/login" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
          <ArrowLeft size={14} /> Back to sign in
        </Link>
      </p>
    </div>
  );
}

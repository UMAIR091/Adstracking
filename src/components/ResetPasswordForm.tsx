"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/Brand";
import { PasswordField, passwordChecks } from "@/components/ui/password-field";

// Set a new password. Reached from the reset email after /auth/callback has
// exchanged the recovery code for a session, so updateUser() is authorized.
export function ResetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);

  // A valid recovery session must exist to change the password.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!passwordChecks(password).valid) {
      return setError("Please choose a password with at least 8 characters, including a letter and a number.");
    }
    if (password !== confirm) return setError("The two passwords don't match.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1500);
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <Link href="/" className="mb-8 flex justify-center">
        <Brand className="text-lg" />
      </Link>
      <div className="rounded-2xl border border-slate-200 bg-surface p-7 shadow-sm">
        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={22} />
            </div>
            <h1 className="text-xl font-semibold text-ink-900">Password updated</h1>
            <p className="mt-2 text-sm text-ink-500">Signing you in…</p>
          </div>
        ) : ready === false ? (
          <div className="text-center">
            <h1 className="text-xl font-semibold text-ink-900">Link expired</h1>
            <p className="mb-4 mt-2 text-sm leading-relaxed text-ink-500">
              This password reset link is invalid or has expired. Request a new one to continue.
            </p>
            <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
              Request a new link
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-ink-900">Choose a new password</h1>
            <p className="mb-5 mt-1 text-sm text-ink-500">Pick a strong password you don&apos;t use elsewhere.</p>
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <PasswordField value={password} onChange={setPassword} showMeter label="New password" autoComplete="new-password" />
              <PasswordField
                value={confirm}
                onChange={setConfirm}
                showMeter={false}
                id="confirm-password"
                label="Confirm password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
              />
              <button
                type="submit"
                disabled={loading || ready === null}
                className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

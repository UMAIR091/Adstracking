"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/Brand";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function AuthForm({ mode, next = "/dashboard" }: { mode: "login" | "signup"; next?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const isSignup = mode === "signup";
  // Post-auth destination — flows through every path (password, email
  // confirmation, Google OAuth) via /auth/callback?next=.
  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl() },
      });
      setLoading(false);
      if (error) return setError(error.message);
      // If email confirmation is on, there's no session yet.
      if (!data.session) {
        return setInfo("Check your email to confirm your account, then sign in.");
      }
      router.push(next);
      router.refresh();
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setError(error.message);
      router.push(next);
      router.refresh();
    }
  }

  async function google() {
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <Link href="/" className="mb-8 flex justify-center">
        <Brand className="text-lg" />
      </Link>
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <h1 className="text-xl font-semibold text-ink-900">{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="mb-5 mt-1 text-sm text-ink-500">
          {isSignup ? "Start sending beautiful client reports." : "Sign in to your workspace."}
        </p>

        <button
          onClick={google}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-slate-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          Continue with Google
        </button>

        <div className="mb-4 flex items-center gap-3 text-xs text-ink-400">
          <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {info && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{info}</div>}
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-700">Email</label>
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-700">Password</label>
            <input
              type="password"
              className={inputClass}
              placeholder={isSignup ? "At least 6 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-ink-500">
        {isSignup ? (
          <>Already have an account? <Link href="/login" className="font-medium text-brand-600 hover:underline">Sign in</Link></>
        ) : (
          <>New here? <Link href="/signup" className="font-medium text-brand-600 hover:underline">Create an account</Link></>
        )}
      </p>
    </div>
  );
}

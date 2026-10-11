"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/Brand";
import { PasswordField, passwordChecks } from "@/components/ui/password-field";
import { track, ANALYTICS } from "@/lib/analytics";
import { metaTrack } from "@/lib/metaPixel";
import { authCallbackUrl } from "@/lib/authRedirect";
import { siteFonts } from "@/lib/siteFonts";

const inputClass =
  "field w-full py-2";

// The site's form treatment for the shared `.field` recipe (this form's and the
// PasswordField's): taller, rounder, warm hairline, teal focus. Scoped here so
// the in-app forms keep theirs.
const siteFields = [
  "[&_.field]:rounded-[10px] [&_.field]:border-site-line-strong [&_.field]:bg-site-card [&_.field]:py-3.5 [&_.field]:text-base",
  "[&_.field:focus]:border-site-accent [&_.field:focus]:ring-site-accent/30",
].join(" ");

export function AuthForm({
  mode,
  next = "/dashboard",
  initialError = null,
}: {
  mode: "login" | "signup";
  next?: string;
  /** Reason a redirect back to this page failed — e.g. a dead confirmation
   *  link. /auth/callback sends it as ?error=, and it went unrendered until
   *  now, so a failed confirmation showed a bare login form. */
  initialError?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const isSignup = mode === "signup";
  // Post-auth destination — flows through every path (password, email
  // confirmation, Google OAuth) via /auth/callback?next=. Pinned to the
  // canonical host; see lib/authRedirect for why that matters.
  const callbackUrl = () => authCallbackUrl(next);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (isSignup) {
      // Real-time UI shows the rules; guard here so a weak password can't slip
      // through (also covers browsers/autofill that bypass field validation).
      if (!passwordChecks(password).valid) {
        setLoading(false);
        return setError("Please choose a password with at least 8 characters, including a letter and a number.");
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl() },
      });
      setLoading(false);
      if (error) return setError(error.message);
      track(ANALYTICS.signedUp, { method: "email" });
      metaTrack("CompleteRegistration", { content_name: "email" });
      // If email confirmation is on there's no session yet — send them to the
      // verification screen, which auto-detects confirmation and continues (no
      // manual re-login). If confirmation is off, go straight in.
      if (!data.session) {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
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
    if (isSignup) {
      track(ANALYTICS.signedUp, { method: "google" });
      metaTrack("CompleteRegistration", { content_name: "google" });
    }
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
  }

  return (
    <div className={`${siteFonts} mx-auto w-full max-w-[440px] font-site text-site-fg`}>
      <Link href="/" className="mb-10 flex justify-center">
        <Brand className="text-lg" />
      </Link>
      <h1 className="text-[40px] font-extrabold leading-[1.1] tracking-[-0.04em]">
        {isSignup ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mb-7 mt-2 text-base text-site-muted">
        {isSignup ? "Start sending beautiful client reports." : "Sign in to your workspace."}
      </p>

      <button
        onClick={google}
        className="mb-3.5 flex w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-full border border-site-line-strong bg-site-card px-4 py-3.5 font-semibold transition-colors hover:border-site-fg"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
        Continue with Google
      </button>

      <div className="mb-3.5 flex items-center gap-3 font-site-mono text-[13px] text-site-muted">
        <span className="h-px flex-1 bg-site-line-strong" /> or <span className="h-px flex-1 bg-site-line-strong" />
      </div>

      <form onSubmit={submit} className={`space-y-4 ${siteFields}`}>
        {error && <div className="rounded-[10px] bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700">{error}</div>}
        {info && <div className="rounded-[10px] bg-success-50 px-3.5 py-2.5 text-sm text-success-700">{info}</div>}
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Email</label>
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {isSignup ? (
          <PasswordField value={password} onChange={setPassword} showMeter autoComplete="new-password" />
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-semibold">Password</label>
              <Link href="/forgot-password" className="text-sm font-semibold text-site-accent hover:underline">
                Forgot password?
              </Link>
            </div>
            <PasswordField
              value={password}
              onChange={setPassword}
              showMeter={false}
              autoComplete="current-password"
              label=""
              placeholder="Your password"
            />
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="!mt-6 w-full whitespace-nowrap rounded-full bg-site-cta px-4 py-4 text-base font-semibold text-site-cta-fg transition-colors hover:bg-site-cta-hover hover:text-site-cta-hover-fg disabled:opacity-50"
        >
          {loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-[15px] text-site-muted">
        {isSignup ? (
          <>Already have an account? <Link href="/login" className="font-semibold text-site-fg underline hover:text-site-accent">Sign in</Link></>
        ) : (
          <>New here? <Link href="/signup" className="font-semibold text-site-fg underline hover:text-site-accent">Create an account</Link></>
        )}
      </p>
    </div>
  );
}

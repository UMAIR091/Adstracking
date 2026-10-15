"use client";

// Email-verification waiting screen (journey audit P0-1). Instead of "check your
// email, then come back and sign in," this screen:
//   • polls for verification and auto-redirects the moment it happens,
//   • lets the user resend (with a cooldown) or change their email,
//   • gives clear troubleshooting help,
// so the signup → first-value path is never a dead end.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MailCheck, RefreshCw, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/Brand";
import { track, ANALYTICS } from "@/lib/analytics";
import { authCallbackUrl } from "@/lib/authRedirect";
import {
  RESEND_COOLDOWN,
  checkVerified,
  clearSignupCredentials,
  heldCredentials,
  resendOutcome,
} from "@/lib/verifyEmailFlow";
import { clearSignupMarker } from "@/lib/signupMarker";

// Supabase rate-limits password sign-ins per IP, so the background poll tries
// the password at most this often; a tab focus or a button press may try sooner.
const SIGN_IN_EVERY_MS = 15_000;
const SIGN_IN_SOON_MS = 3_000;

export function VerifyEmail({ email, justSent = true }: { email: string; justSent?: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  // Straight after signup the email went out moments ago, and Supabase refuses
  // another within a minute, so the resend button starts on its cooldown.
  const [cooldown, setCooldown] = useState(justSent ? RESEND_COOLDOWN : 0);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const redirected = useRef(false);
  // The password the user just signed up with, if this screen was reached from
  // the form in this tab (memory only — see lib/verifyEmailFlow).
  const creds = useRef(heldCredentials(email));
  const lastSignIn = useRef(0);
  const backoffUntil = useRef(0);

  const goOnVerified = useCallback(() => {
    if (redirected.current) return;
    redirected.current = true;
    clearSignupMarker();
    track(ANALYTICS.emailVerified);
    setVerified(true);
    // The dashboard layout routes un-onboarded users to /onboarding, so this
    // single destination works for every signup.
    setTimeout(() => { router.push("/dashboard"); router.refresh(); }, 900);
  }, [router]);

  // Detect verification. Link opened in this browser: its session shows up
  // here. Link opened on another device (e.g. the phone): this browser has no
  // session to see, so sign in with the held password, which works as soon as
  // the address is confirmed.
  const check = useCallback(async (soon = false): Promise<boolean> => {
    const now = Date.now();
    const gap = soon ? SIGN_IN_SOON_MS : SIGN_IN_EVERY_MS;
    const tryPassword = !!creds.current && now >= backoffUntil.current && now - lastSignIn.current >= gap;
    if (tryPassword) lastSignIn.current = now;
    const result = await checkVerified(supabase, tryPassword ? creds.current : null);
    if (result === "verified") { clearSignupCredentials(); goOnVerified(); return true; }
    if (result === "rate_limited") backoffUntil.current = now + 60_000;
    if (result === "wrong_password") { creds.current = null; clearSignupCredentials(); }
    return false;
  }, [supabase, goOnVerified]);

  // Auto-poll every few seconds, and check straight away when the user comes
  // back to this tab (typically right after tapping the link on their phone).
  useEffect(() => {
    const id = setInterval(() => check(), 4000);
    const onFocus = () => check(true);
    const onVisible = () => { if (document.visibilityState === "visible") check(true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    // Auth state change fires instantly if verification happens in this tab.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) goOnVerified();
    });
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      sub.subscription.unsubscribe();
    };
  }, [check, supabase, goOnVerified]);

  // Cooldown ticker for the resend button.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function manualCheck() {
    setChecking(true);
    setNotice(null);
    const ok = await check(true);
    setChecking(false);
    if (ok) return;
    setNotice(
      creds.current
        ? "Not verified yet. Click the link in your email, on any device, and this page continues automatically."
        : "Not verified in this browser yet. If you clicked the link on another device, you're verified: sign in to continue."
    );
  }

  async function resend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setNotice(null);
    // Already confirmed on another device? Supabase would answer "sent" and send
    // nothing, so carry on instead of resending.
    if (await check(true)) { setResending(false); return; }
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      // Same canonical host as the original signup link — a resend that pointed
      // at a different origin would fail the PKCE exchange exactly as the first
      // one did (see lib/authRedirect).
      options: { emailRedirectTo: authCallbackUrl("/dashboard") },
    });
    setResending(false);
    const outcome = resendOutcome(error, !!creds.current);
    setCooldown(outcome.cooldown);
    setNotice(outcome.notice);
  }

  if (verified) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-600">
            <CheckCircle2 size={24} />
          </div>
          <h1 className="text-xl font-semibold text-ink-900">Email verified</h1>
          <p className="mt-2 flex items-center justify-center gap-2 text-sm text-ink-500"><Loader2 size={14} className="animate-spin" /> Setting up your workspace…</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <MailCheck size={24} />
        </div>
        <h1 className="text-xl font-semibold text-ink-900">Verify your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          We sent a verification link to <span className="font-medium text-ink-700">{email || "your email"}</span>.{" "}
          {creds.current
            ? "Click it on any device, even your phone, and this page continues automatically."
            : "Click it and you'll be signed in on the device you open it on."}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-ink-50 py-2 text-xs text-ink-500">
        <Loader2 size={13} className="animate-spin" /> Waiting for verification…
      </div>

      {notice && <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-center text-xs text-ink-600">{notice}</p>}

      <button
        onClick={manualCheck}
        disabled={checking}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-solid px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-solid-hover disabled:opacity-50"
      >
        {checking ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} I&apos;ve verified my email
      </button>

      <div className="mt-3 flex items-center justify-center gap-1 text-sm text-ink-500">
        Didn&apos;t get it?
        <button onClick={resend} disabled={cooldown > 0 || resending} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline disabled:text-ink-400 disabled:no-underline">
          {resending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-ink-100 bg-ink-50 p-3 text-left text-xs leading-relaxed text-ink-500">
        <p className="font-medium text-ink-700">Not seeing it?</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Check your spam or promotions folder.</li>
          <li>It can take a minute to arrive.</li>
          <li>Make sure <span className="font-medium text-ink-600">{email}</span> is correct — <Link href="/signup" className="font-medium text-brand-600 hover:underline">use a different email</Link>.</li>
        </ul>
      </div>

      <p className="mt-5 text-center text-sm text-ink-500">
        <Link href="/login" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
          <ArrowLeft size={14} /> Back to sign in
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm">
      <Link href="/" className="mb-8 flex justify-center"><Brand className="text-lg" /></Link>
      <div className="rounded-2xl border border-ink-200 bg-surface p-7 shadow-sm">{children}</div>
    </div>
  );
}

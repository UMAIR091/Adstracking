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

const RESEND_COOLDOWN = 45; // seconds

export function VerifyEmail({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const redirected = useRef(false);

  const goOnVerified = useCallback(() => {
    if (redirected.current) return;
    redirected.current = true;
    setVerified(true);
    // The dashboard layout routes un-onboarded users to /onboarding, so this
    // single destination works for every signup.
    setTimeout(() => { router.push("/dashboard"); router.refresh(); }, 900);
  }, [router]);

  // Detect verification: a confirmed email produces a session (same browser,
  // shared cookies) or a user with email_confirmed_at.
  const check = useCallback(async (): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) { goOnVerified(); return true; }
    const { data: { user } } = await supabase.auth.getUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (user && (user as any).email_confirmed_at) { goOnVerified(); return true; }
    return false;
  }, [supabase, goOnVerified]);

  // Auto-poll every few seconds, and also when the tab regains focus.
  useEffect(() => {
    const id = setInterval(check, 4000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    // Auth state change fires instantly if verification happens in this tab.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) goOnVerified();
    });
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); sub.subscription.unsubscribe(); };
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
    const ok = await check();
    setChecking(false);
    if (!ok) setNotice("Not verified yet — click the link in your email, then this page will continue automatically.");
  }

  async function resend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setNotice(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    setResending(false);
    setCooldown(RESEND_COOLDOWN);
    setNotice(error && !/rate/i.test(error.message) ? error.message : "Verification email sent. Check your inbox (and spam).");
  }

  if (verified) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
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
          We sent a verification link to <span className="font-medium text-ink-700">{email || "your email"}</span>. Click it
          and this page continues automatically — no need to come back and sign in.
        </p>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-slate-50 py-2 text-xs text-ink-500">
        <Loader2 size={13} className="animate-spin" /> Waiting for verification…
      </div>

      {notice && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-ink-600">{notice}</p>}

      <button
        onClick={manualCheck}
        disabled={checking}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
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

      <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-3 text-left text-xs leading-relaxed text-ink-500">
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
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">{children}</div>
    </div>
  );
}

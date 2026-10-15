// Logic behind the "verify your email" waiting screen (components/VerifyEmail).
//
// The screen used to notice a confirmation only when the link was opened in the
// SAME browser, because it looked for a session and the click is what creates
// one. Sign up on a laptop, tap the link on a phone, and the phone got the
// session while the laptop waited forever. The laptop does still hold the
// password the user just chose, though, and that password signs in the moment
// the address is confirmed, from any device.
//
// The password is held in memory only (a module variable survives Next's
// client-side navigation from the signup form to this screen, never a reload)
// and never written to storage.

type Credentials = { email: string; password: string };
type Held = Credentials & { at: number };

// Long enough to go and find the email; short enough not to keep a password
// in memory indefinitely.
const HOLD_MS = 30 * 60 * 1000;
let held: Held | null = null;

export function holdSignupCredentials(email: string, password: string): void {
  held = { email, password, at: Date.now() };
}

export function heldCredentials(email: string): Credentials | null {
  if (!held) return null;
  if (Date.now() - held.at > HOLD_MS || held.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    held = null;
    return null;
  }
  return { email: held.email, password: held.password };
}

export function clearSignupCredentials(): void {
  held = null;
}

type AuthErrorLike = { message: string; status?: number; code?: string } | null;

type AuthLike = {
  auth: {
    getSession(): Promise<{ data: { session: unknown } }>;
    signInWithPassword(c: Credentials): Promise<{ error: AuthErrorLike }>;
  };
};

export type VerifyCheck =
  | "verified" //       session here, or the held password now signs in
  | "waiting" //        not confirmed yet (or nothing to check with)
  | "rate_limited" //   too many sign-in attempts: back off
  | "wrong_password"; // the held password no longer works: stop using it

export async function checkVerified(supabase: AuthLike, creds: Credentials | null): Promise<VerifyCheck> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return "verified";
  if (!creds) return "waiting";
  const { error } = await supabase.auth.signInWithPassword(creds);
  if (!error) return "verified";
  if (error.status === 429 || error.code === "over_request_rate_limit") return "rate_limited";
  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) return "wrong_password";
  return "waiting"; // email_not_confirmed, or a network blip
}

// Supabase allows one confirmation email per address per minute (its default
// SMTP minimum interval). Waiting less than that makes the next click fail.
export const RESEND_COOLDOWN = 60;

// What to tell the user after asking Supabase to resend, and how long to lock
// the button. Rate-limit failures used to be reported as "Verification email
// sent", which is why a resend could appear to work and never arrive.
export function resendOutcome(error: AuthErrorLike, canAutoContinue: boolean): { notice: string; cooldown: number } {
  if (error) {
    const wait = /after (\d+) seconds?/i.exec(error.message)?.[1];
    if (wait) {
      return { notice: `Please wait ${wait} seconds, then request another email.`, cooldown: Number(wait) };
    }
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return { notice: "Too many emails have been requested. Please wait a few minutes and try again.", cooldown: RESEND_COOLDOWN };
    }
    return { notice: error.message, cooldown: 0 };
  }
  // Supabase answers "sent" without sending when the address is already
  // confirmed. If this screen can't sign in by itself, say what that means.
  return {
    notice: canAutoContinue
      ? "Verification email sent. Check your inbox (and spam)."
      : "Verification email sent. Check your inbox (and spam). Already clicked a link on another device? Then you're verified: sign in to continue.",
    cooldown: RESEND_COOLDOWN,
  };
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
import { logError } from "@/lib/errorLog";

// Handles every link that returns a user to the app with a session to claim:
// Google OAuth, email confirmation, and password reset.
//
// Two link shapes arrive here, and only one used to be handled:
//
//   ?code=…        PKCE. Exchanged for a session, but ONLY in the browser that
//                  started the flow — the code verifier is a cookie scoped to
//                  that host. Sign up on a laptop, open the mail on a phone,
//                  and there is no verifier to exchange with.
//   ?token_hash=…  Carries no verifier, so it works from any browser or device.
//   &type=…        This is the shape that rescues the cross-device case, and it
//                  was previously ignored — the request fell straight through
//                  to the failure redirect.
//
// Failures used to collapse into one message with the real reason discarded.
// They are now logged and passed back to /login, which renders them.
type EmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";
const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];
const isOtpType = (v: string | null): v is EmailOtpType => !!v && (OTP_TYPES as string[]).includes(v);

const FAILED = "We couldn't confirm that link. It may have expired or already been used — request a new one below.";
// PKCE only fails this way when the verifier cookie is absent, which in
// practice means a different browser. Saying so beats a generic error.
const WRONG_BROWSER =
  "Please open the confirmation link in the same browser you signed up from, or request a new one below.";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // Supabase reports an expired or already-consumed link as error params rather
  // than a token, so this has to be checked before looking for one.
  const linkError = searchParams.get("error_description") ?? searchParams.get("error");

  const fail = async (reason: string, userMessage: string) => {
    await logError({ context: "oauth_callback", message: `Auth callback failed: ${reason}` }).catch(() => {});
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(userMessage)}`);
  };

  if (linkError) return fail(linkError, FAILED);

  const supabase = createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return fail(`code exchange: ${error.message}`, WRONG_BROWSER);
  }

  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return fail(`verifyOtp(${type}): ${error.message}`, FAILED);
  }

  return fail("callback carried neither code nor token_hash", FAILED);
}

// Where Supabase sends a user back to after an email confirmation, a password
// reset or a Google sign-in.
//
// Built from NEXT_PUBLIC_APP_URL — deliberately NOT window.location.origin.
//
// Production answers on both the custom domain and the project's *.vercel.app
// alias, so the origin a visitor happens to be browsing decided where their
// confirmation link pointed. That matters because signup uses PKCE: the code
// verifier is a cookie scoped to the host that STARTED the flow. Come back on
// the other host and the cookie isn't sent, exchangeCodeForSession fails, and a
// perfectly valid link reads as "Could not sign you in".
//
// The same host split broke integration OAuth with "Invalid state" (see
// canonicalHost in lib/supabase/middleware). This is the auth half of that fix:
// pin the link to one host up front, so the middleware's canonical redirect
// never has to fire on /auth/callback and the verifier cookie always travels.
//
// Falls back to the browser's origin only when the env var is absent, which is
// local development.
export function authCallbackUrl(next = "/dashboard"): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  const base = configured || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
}

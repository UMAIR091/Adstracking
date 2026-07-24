import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Builds a Content-Security-Policy (audit #8/#10).
//
// Two variants, chosen by route:
//   • STRICT (nonce + 'strict-dynamic') for the authenticated dashboard, which
//     is dynamically rendered — so Next.js stamps the fresh nonce onto its
//     scripts every request and modern browsers ignore 'unsafe-inline'. The
//     Paddle SDK still works: 'strict-dynamic' propagates trust to scripts the
//     (nonced) app code injects at runtime. The 'unsafe-inline' https: tail is a
//     fallback only for browsers that don't understand 'strict-dynamic'.
//   • LEGACY (no nonce) for static/marketing pages. A per-request nonce can't be
//     baked into a cached/ISR page, so forcing one there would break their
//     scripts; those pages carry no user data, so the existing policy is kept.
const PADDLE_SCRIPT = "https://cdn.paddle.com https://sandbox-cdn.paddle.com https://public-cdn.paddle.com";
const PADDLE_CONNECT =
  "https://api.paddle.com https://sandbox-api.paddle.com " +
  "https://checkout-service.paddle.com https://sandbox-checkout-service.paddle.com " +
  "https://cdn.paddle.com https://sandbox-cdn.paddle.com";
const PADDLE_FRAME = "https://buy.paddle.com https://sandbox-buy.paddle.com";

function buildCsp(nonce: string, strict: boolean): string {
  const supabaseOrigin = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
    } catch {
      return "";
    }
  })();
  const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");

  const scriptSrc = strict
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https:`
    : `script-src 'self' 'unsafe-inline' ${PADDLE_SCRIPT}`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigin} ${supabaseWs} ${PADDLE_CONNECT}`.replace(/\s+/g, " ").trim(),
    `frame-src 'self' ${PADDLE_FRAME}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

// Refreshes the Supabase session cookie and guards /dashboard, while attaching a
// nonce'd CSP to every response.
//
// Auth performance (audit #8): auth.getUser() validates the JWT against the
// Supabase auth server — a network round-trip. Doing it on EVERY matched request
// (marketing pages, API routes, etc.) is wasteful. We now only call it on
// auth-relevant paths (/dashboard guard + keeping signed-in users off
// /login,/signup); API routes already enforce their own auth. This removes the
// per-request auth-server hop on the majority of traffic.
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const nonce = crypto.randomUUID();
  // Strict, nonce'd CSP for the dynamically-rendered dashboard; legacy policy
  // for static/marketing routes (see buildCsp).
  const csp = buildCsp(nonce, path.startsWith("/dashboard"));

  // Propagate the nonce to the app (Next reads it to nonce its bootstrap
  // scripts; server components read it via headers() for inline JSON-LD).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const authRelevant = path.startsWith("/dashboard") || path === "/login" || path === "/signup";

  if (authRelevant) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && path.startsWith("/dashboard")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      const redirect = NextResponse.redirect(url);
      redirect.headers.set("content-security-policy", csp);
      return redirect;
    }

    if (user && (path === "/login" || path === "/signup")) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      const redirect = NextResponse.redirect(url);
      redirect.headers.set("content-security-policy", csp);
      return redirect;
    }
  }

  response.headers.set("content-security-policy", csp);
  return response;
}

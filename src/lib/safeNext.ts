// Validates a post-auth redirect target.
//
// `next` comes from the query string, so it is attacker-controlled: without a
// check, /login?next=https://evil.example turns our own sign-in page into an
// open redirect that phishing can point at. Only same-site absolute paths are
// allowed — "//host" is rejected too, since browsers read it as protocol-
// relative and would leave the site.
export function safeNext(value: string | null | undefined, fallback = "/dashboard"): string {
  const v = (value ?? "").trim();
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//")) return fallback;
  if (v.includes("\\")) return fallback; // some parsers treat \ as /
  return v;
}

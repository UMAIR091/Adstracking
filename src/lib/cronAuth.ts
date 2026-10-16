import crypto from "node:crypto";

// Shared authorization for cron endpoints: an Authorization: Bearer CRON_SECRET
// header, which Vercel Cron sends when CRON_SECRET is configured and the sync
// dispatcher sends to its workers. The secret is no longer accepted as a
// ?key= query parameter: URLs end up in request logs, browser history and
// third-party schedulers' dashboards, and every caller sends the header. For a
// manual run use: curl -H "Authorization: Bearer $CRON_SECRET" <url>.
// Uses a constant-time comparison so the secret can't be probed byte-by-byte.
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  return timingSafeEqual(bearer, secret);
}

function timingSafeEqual(candidate: string | null, secret: string): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

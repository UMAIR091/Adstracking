import crypto from "node:crypto";

// Shared authorization for cron endpoints. Accepts either ?key=CRON_SECRET
// (cron-job.org, manual runs) or an Authorization: Bearer CRON_SECRET header
// (Vercel Cron sets this when the CRON_SECRET env var is configured).
// Uses a constant-time comparison so the secret can't be probed byte-by-byte.
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const key = new URL(req.url).searchParams.get("key");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

  return timingSafeEqual(key, secret) || timingSafeEqual(bearer, secret);
}

function timingSafeEqual(candidate: string | null, secret: string): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

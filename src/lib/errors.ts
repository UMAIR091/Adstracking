// User-facing error mapping (audit #7).
//
// Raw database / OAuth / provider / runtime error strings must never reach the
// browser: they leak internal structure (table names, SQL, provider payloads,
// stack traces) and are meaningless to users. publicError() returns a short,
// friendly message plus a correlation id; the full technical detail stays in the
// server logs, retrievable by that id.
import crypto from "node:crypto";
import { captureException } from "@/lib/monitoring";

export type PublicError = { error: string; errorId: string };

// A curated set of provider/flow messages that ARE safe and useful to surface
// verbatim (they describe a user-fixable condition, not internals). Matched
// case-insensitively as substrings.
const SAFE_PATTERNS: RegExp[] = [
  /access[_\s-]?denied/i,
  /permission/i,
  /not found/i,
  /already (connected|subscribed|exists)/i,
  /invalid (api key|token|credential|url)/i,
  /rate limit/i,
  /expired/i,
  /please reconnect/i,
  /limit reached/i,
  /required/i,
  /unsupported/i,
];

function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

// True when a message is safe to show the user as-is (short + matches an allow
// pattern + contains no obvious internals).
export function isSafeMessage(msg: string): boolean {
  if (!msg || msg.length > 160) return false;
  if (/(\bselect\b|\binsert\b|\bupdate\b|\brelation\b|syntax error|econnrefused|null value|constraint|stack|at \/|\bpg\b)/i.test(msg)) {
    return false;
  }
  return SAFE_PATTERNS.some((re) => re.test(msg));
}

// Maps any thrown value to a { error, errorId } pair, logging the full detail
// against the id. `fallback` is shown when the raw message isn't safe to reveal.
export function publicError(
  err: unknown,
  fallback = "Something went wrong on our end. Please try again.",
  context?: Record<string, unknown>
): PublicError {
  const errorId = crypto.randomUUID().slice(0, 8);
  const raw = rawMessage(err);
  captureException(err, { errorId, ...context });
  return { error: isSafeMessage(raw) ? raw : `${fallback} (ref: ${errorId})`, errorId };
}

// Redirect-flow variant: returns a single user-facing string (safe message, or
// fallback with a ref id) for putting in a `?connect_error=` param. Never
// includes raw internals.
export function publicMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
  context?: Record<string, unknown>
): string {
  return publicError(err, fallback, context).error;
}

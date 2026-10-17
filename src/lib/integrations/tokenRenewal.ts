// When a connection's token gets renewed, and when the user has to reconnect.
// One place, so the sync (googleTokens.getValidAccessToken), the health page
// and the client's data-source cards all agree. See TokenRenewal in types.ts.
import { oauthForType } from "./registry";
import type { TokenRenewal } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

// "refresh" tokens are renewed just before they expire.
export const EXPIRY_BUFFER_MS = 60_000;
// "extend" tokens are renewed this far ahead: comfortably more than the daily
// sync interval, and late enough that the token is past Instagram's 24-hour
// minimum age (its tokens last 60 days).
export const EXTEND_AHEAD_MS = 10 * DAY_MS;
// "reconnect" tokens start warning this far ahead of their expiry.
export const RECONNECT_WARN_MS = 14 * DAY_MS;

type Connection = { type?: string | null; config?: Record<string, unknown> | null };

export function renewalFor(conn: Connection): TokenRenewal {
  const p = conn.config?.identity_provider;
  return oauthForType(conn.type)?.renewal?.({ provider: typeof p === "string" ? p : undefined }) ?? "refresh";
}

// How long before expiry the sync should renew this connection's token.
export function renewAheadMs(conn: Connection): number {
  return renewalFor(conn) === "extend" ? EXTEND_AHEAD_MS : EXPIRY_BUFFER_MS;
}

// For a token that can't be extended, the date the user must reconnect by, once
// it is within the warning window (or already past). Null when nothing is due.
export function reconnectDeadline(
  conn: Connection & { token_expires_at?: string | null },
  now: number = Date.now()
): string | null {
  if (!conn.token_expires_at || renewalFor(conn) !== "reconnect") return null;
  const expires = new Date(conn.token_expires_at).getTime();
  if (Number.isNaN(expires)) return null;
  return expires - now <= RECONNECT_WARN_MS ? conn.token_expires_at : null;
}

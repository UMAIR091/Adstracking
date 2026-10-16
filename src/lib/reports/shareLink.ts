import crypto from "node:crypto";

// A report's public link is /r/<share_token>. The token is the only thing
// guarding it, so it is 128 random bits, and it can be revoked (set to null,
// after which the link 404s) or replaced with a new one. Reports are written
// by the server only (migration 0044), so changes go through
// /api/reports/[id]/share.
export function newShareToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export type ShareAction = "revoke" | "renew";

export function isShareAction(v: unknown): v is ShareAction {
  return v === "revoke" || v === "renew";
}

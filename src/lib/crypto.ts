import crypto from "node:crypto";

// AES-256-GCM encryption for OAuth tokens at rest, with key versioning so keys
// can be rotated without invalidating every stored token.
//
// Ciphertext format:  <version>:<iv>.<tag>.<data>   (e.g. "1:AAA.BBB.CCC")
// Legacy ciphertext (pre-versioning) has no "<version>:" prefix — three dot-
// separated parts — and is decrypted with the v1 key. New values always carry a
// version prefix.
//
// Keys (all 32 bytes, base64-encoded):
//   TOKEN_ENCRYPTION_KEY          — the ACTIVE key used to encrypt new values.
//   TOKEN_ENCRYPTION_KEY_VERSION  — the active key's version label (default "1").
//   TOKEN_ENCRYPTION_KEY_V<n>     — retired keys, kept only so old ciphertext
//                                   stays decryptable after a rotation.
//
// To rotate: generate a new key, then set
//   TOKEN_ENCRYPTION_KEY_V1 = <the current key>   (preserve it for old tokens)
//   TOKEN_ENCRYPTION_KEY     = <the new key>
//   TOKEN_ENCRYPTION_KEY_VERSION = 2
// Existing tokens keep decrypting with v1; everything newly written uses v2.
// Generate a key with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

const ALGO = "aes-256-gcm";
const DEFAULT_VERSION = "1";

function decodeKey(raw: string, label: string): Buffer {
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error(`${label} must decode to 32 bytes`);
  return buf;
}

// Build the version→key map from the environment. The active key is registered
// under its version label; any TOKEN_ENCRYPTION_KEY_V<n> vars are added so old
// ciphertext survives a rotation. Cached per-process.
let keyCache: { active: string; keys: Map<string, Buffer> } | null = null;

function keyring(): { active: string; keys: Map<string, Buffer> } {
  if (keyCache) return keyCache;

  const active = process.env.TOKEN_ENCRYPTION_KEY_VERSION?.trim() || DEFAULT_VERSION;
  const keys = new Map<string, Buffer>();

  const primary = process.env.TOKEN_ENCRYPTION_KEY;
  if (!primary) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  keys.set(active, decodeKey(primary, "TOKEN_ENCRYPTION_KEY"));

  // Retired keys, e.g. TOKEN_ENCRYPTION_KEY_V1. These never overwrite the active
  // key registered above (so setting _V1 == the current key during the first
  // rotation is harmless).
  for (const [name, value] of Object.entries(process.env)) {
    const m = /^TOKEN_ENCRYPTION_KEY_V(\d+)$/.exec(name);
    if (m && value && !keys.has(m[1])) keys.set(m[1], decodeKey(value, name));
  }

  keyCache = { active, keys };
  return keyCache;
}

function keyForVersion(version: string): Buffer {
  const key = keyring().keys.get(version);
  if (!key) throw new Error(`No encryption key configured for version "${version}". Set TOKEN_ENCRYPTION_KEY_V${version}.`);
  return key;
}

export function encrypt(plain: string): string {
  const { active } = keyring();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyForVersion(active), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${active}:${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decrypt(payload: string): string {
  // Split off an optional "<version>:" prefix. A raw base64 IV never contains
  // ":", so the first ":" unambiguously separates version from body.
  let version = DEFAULT_VERSION;
  let body = payload;
  const sep = payload.indexOf(":");
  if (sep !== -1) {
    version = payload.slice(0, sep);
    body = payload.slice(sep + 1);
  }

  const [ivB, tagB, dataB] = body.split(".");
  const decipher = crypto.createDecipheriv(ALGO, keyForVersion(version), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}

import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";

// A valid 32-byte base64 key must exist before the crypto module builds its
// keyring (cached on first use), so set it before importing.
beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  process.env.TOKEN_ENCRYPTION_KEY_VERSION = "1";
});

describe("token encryption", () => {
  it("round-trips a value", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const secret = "ya29.some-oauth-access-token";
    const enc = encrypt(secret);
    expect(enc).not.toContain(secret); // never stored in plaintext
    expect(enc.startsWith("1:")).toBe(true); // versioned prefix
    expect(decrypt(enc)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same");
    expect(decrypt(b)).toBe("same");
  });

  it("fails to decrypt tampered ciphertext (GCM auth)", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const enc = encrypt("secret");
    const tampered = enc.slice(0, -2) + (enc.endsWith("A") ? "B" : "A");
    expect(() => decrypt(tampered)).toThrow();
  });
});

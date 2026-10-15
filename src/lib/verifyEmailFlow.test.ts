import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RESEND_COOLDOWN,
  checkVerified,
  clearSignupCredentials,
  heldCredentials,
  holdSignupCredentials,
  resendOutcome,
} from "./verifyEmailFlow";

afterEach(() => {
  clearSignupCredentials();
  vi.useRealTimers();
});

const creds = { email: "owner@agency.test", password: "s3cret-pass" };

function fakeAuth(opts: { session?: boolean; signIn?: { message: string; status?: number; code?: string } | null }) {
  const signInWithPassword = vi.fn(async () => ({ error: opts.signIn ?? null }));
  return {
    client: { auth: { getSession: async () => ({ data: { session: opts.session ? {} : null } }), signInWithPassword } },
    signInWithPassword,
  };
}

describe("held signup credentials", () => {
  it("are handed to the verification screen for the same address", () => {
    holdSignupCredentials("Owner@Agency.test", "pw");
    expect(heldCredentials("owner@agency.test ")).toEqual({ email: "Owner@Agency.test", password: "pw" });
  });

  it("are not handed over for a different address", () => {
    holdSignupCredentials("owner@agency.test", "pw");
    expect(heldCredentials("someone@else.test")).toBeNull();
  });

  it("expire after 30 minutes", () => {
    vi.useFakeTimers();
    holdSignupCredentials("owner@agency.test", "pw");
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(heldCredentials("owner@agency.test")).toBeNull();
  });
});

describe("checkVerified", () => {
  it("is verified when the link was opened in this browser (session present)", async () => {
    const { client, signInWithPassword } = fakeAuth({ session: true });
    expect(await checkVerified(client, creds)).toBe("verified");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("is verified when the link was opened on another device and the password now signs in", async () => {
    const { client } = fakeAuth({ signIn: null });
    expect(await checkVerified(client, creds)).toBe("verified");
  });

  it("keeps waiting while the address is unconfirmed", async () => {
    const { client } = fakeAuth({ signIn: { message: "Email not confirmed", status: 400, code: "email_not_confirmed" } });
    expect(await checkVerified(client, creds)).toBe("waiting");
  });

  it("backs off when sign-ins are rate limited", async () => {
    const { client } = fakeAuth({ signIn: { message: "Request rate limit reached", status: 429, code: "over_request_rate_limit" } });
    expect(await checkVerified(client, creds)).toBe("rate_limited");
  });

  it("stops using a password that no longer works", async () => {
    const { client } = fakeAuth({ signIn: { message: "Invalid login credentials", status: 400 } });
    expect(await checkVerified(client, creds)).toBe("wrong_password");
  });

  it("only checks for a session when it has no password", async () => {
    const { client, signInWithPassword } = fakeAuth({});
    expect(await checkVerified(client, null)).toBe("waiting");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("resendOutcome", () => {
  it("never reports a rate-limited resend as sent", () => {
    const r = resendOutcome({ message: "Email rate limit exceeded", status: 429, code: "over_email_send_rate_limit" }, true);
    expect(r.notice).not.toMatch(/sent/i);
    expect(r.cooldown).toBe(RESEND_COOLDOWN);
  });

  it("uses Supabase's own wait time when it gives one", () => {
    const r = resendOutcome({ message: "For security purposes, you can only request this after 37 seconds.", status: 429 }, true);
    expect(r.notice).toContain("37 seconds");
    expect(r.cooldown).toBe(37);
  });

  it("waits the full minute Supabase requires after a send", () => {
    expect(resendOutcome(null, true)).toEqual({ notice: expect.stringMatching(/sent/i), cooldown: 60 });
  });

  it("tells a screen that can't auto-continue that a link clicked elsewhere already verified them", () => {
    expect(resendOutcome(null, false).notice).toMatch(/another device.*sign in/i);
  });
});

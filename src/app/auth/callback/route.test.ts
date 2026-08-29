// The callback that turns an email link into a session.
//
// It used to handle exactly one link shape — ?code= (PKCE) — and treat
// everything else as a generic failure. Two consequences, both user-facing:
// a ?token_hash= link (the shape that works from ANY browser, and so the only
// one that survives "sign up on the laptop, open the mail on the phone") fell
// straight through to the error redirect; and every failure returned the same
// sentence with the real reason discarded, to a login page that never rendered
// it anyway.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
const logError = vi.fn(async (_event: unknown) => {});

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}));
vi.mock("@/lib/errorLog", () => ({ logError: (e: unknown) => logError(e) }));

let GET: (req: Request) => Promise<Response>;
beforeAll(async () => {
  ({ GET } = await import("./route"));
});

const ORIGIN = "https://tryreportflow.com";
const call = (qs: string) => GET(new Request(`${ORIGIN}/auth/callback${qs}`));
const locationOf = (res: Response) => res.headers.get("location") ?? "";

beforeEach(() => {
  vi.clearAllMocks();
  exchangeCodeForSession.mockResolvedValue({ error: null });
  verifyOtp.mockResolvedValue({ error: null });
});

describe("auth callback", () => {
  it("exchanges a PKCE code and lands on the requested page", async () => {
    const res = await call("?code=abc123&next=%2Fdashboard");

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(res.status).toBe(307);
    expect(locationOf(res)).toBe(`${ORIGIN}/dashboard`);
  });

  it("accepts a token_hash link — the one that works from another device", async () => {
    // Previously ignored entirely: no `code`, so it fell to the failure path
    // even though the link was perfectly valid.
    const res = await call("?token_hash=hash-xyz&type=signup&next=%2Fdashboard");

    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "hash-xyz" });
    expect(locationOf(res)).toBe(`${ORIGIN}/dashboard`);
  });

  it("handles a recovery token_hash for password reset", async () => {
    const res = await call("?token_hash=h&type=recovery&next=%2Freset-password");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "h" });
    expect(locationOf(res)).toBe(`${ORIGIN}/reset-password`);
  });

  it("rejects an unknown otp type rather than passing it to Supabase", async () => {
    const res = await call("?token_hash=h&type=not-a-type");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(locationOf(res)).toContain("/login?error=");
  });

  it("tells the user to use the same browser when the code exchange fails", async () => {
    // PKCE fails this way when the verifier cookie is missing, which in
    // practice means they opened the link somewhere else.
    exchangeCodeForSession.mockResolvedValue({ error: { message: "code verifier missing" } });

    const res = await call("?code=abc");

    expect(locationOf(res)).toContain("/login?error=");
    expect(decodeURIComponent(locationOf(res))).toMatch(/same browser/i);
  });

  it("passes an expired-link error through instead of attempting an exchange", async () => {
    const res = await call("?error=access_denied&error_description=Email%20link%20is%20invalid%20or%20has%20expired");

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(decodeURIComponent(locationOf(res))).toMatch(/expired or already been used/i);
  });

  it("fails cleanly when the link carries no token at all", async () => {
    const res = await call("");
    expect(locationOf(res)).toContain("/login?error=");
  });

  it("logs the real reason on every failure", async () => {
    // The reason used to be discarded, which is why a dead link was
    // indistinguishable from a bug for weeks at a time.
    exchangeCodeForSession.mockResolvedValue({ error: { message: "boom" } });

    await call("?code=abc");

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ context: "oauth_callback", message: expect.stringContaining("boom") })
    );
  });

  it("refuses an off-site next target", async () => {
    const res = await call("?code=abc&next=%2F%2Fevil.com");
    // safeNext collapses it to the default rather than redirecting off-site.
    expect(locationOf(res)).toBe(`${ORIGIN}/dashboard`);
  });
});

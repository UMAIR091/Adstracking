import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resendProvider } from "./resend";

const ARGS = { from: "Agency <r@agency.com>", to: "client@example.com", subject: "Report", html: "<p>hi</p>" };

function respond(status: number, body: unknown) {
  const calls: { headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push({ headers: init.headers as Record<string, string> });
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    })
  );
  return calls;
}

beforeEach(() => { process.env.RESEND_API_KEY = "re_test"; });
afterEach(() => vi.unstubAllGlobals());

describe("Resend send idempotency", () => {
  it("sends the idempotency key as a header when given one", async () => {
    const calls = respond(200, { id: "em_1" });
    expect(await resendProvider.send({ ...ARGS, idempotencyKey: "scheduled-delivery-d1:wl" })).toEqual({ id: "em_1" });
    expect(calls[0].headers["Idempotency-Key"]).toBe("scheduled-delivery-d1:wl");
  });

  it("sends no key header otherwise", async () => {
    const calls = respond(200, { id: "em_2" });
    await resendProvider.send(ARGS);
    expect(calls[0].headers["Idempotency-Key"]).toBeUndefined();
  });

  it("treats a key already used by an earlier attempt as delivered, never sending again", async () => {
    respond(409, { name: "invalid_idempotent_request", message: "already used" });
    expect(await resendProvider.send({ ...ARGS, idempotencyKey: "k" })).toEqual({ id: "", duplicate: true });
  });

  it("keeps an in-flight key an error, so the retry loop tries again", async () => {
    respond(409, { name: "concurrent_idempotent_requests", message: "in progress" });
    await expect(resendProvider.send({ ...ARGS, idempotencyKey: "k" })).rejects.toThrow(/in progress/);
  });
});

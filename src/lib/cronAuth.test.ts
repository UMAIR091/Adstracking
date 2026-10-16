import { afterEach, describe, expect, it } from "vitest";
import { cronAuthorized } from "./cronAuth";

const saved = process.env.CRON_SECRET;
afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
});

describe("cronAuthorized", () => {
  it("accepts the secret as a Bearer header", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(cronAuthorized(new Request("https://x.test/api/cron/sync", { headers: { Authorization: "Bearer s3cret" } }))).toBe(true);
  });

  it("no longer accepts it in the URL, where it would be logged", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(cronAuthorized(new Request("https://x.test/api/cron/sync?key=s3cret"))).toBe(false);
  });

  it("refuses a wrong secret, and everything when none is configured", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(cronAuthorized(new Request("https://x.test/", { headers: { Authorization: "Bearer nope" } }))).toBe(false);
    delete process.env.CRON_SECRET;
    expect(cronAuthorized(new Request("https://x.test/", { headers: { Authorization: "Bearer s3cret" } }))).toBe(false);
  });
});

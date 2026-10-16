import { describe, it, expect } from "vitest";
import { decodeConnectFlash, describeConnectFlash, encodeConnectFlash } from "./connectFlash";

describe("connect flash", () => {
  it("round-trips non-ASCII names through a cookie-safe value", () => {
    const value = encodeConnectFlash({ account: "Acme Running — Ads (Café)", identity: "Ali Umair" });
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeConnectFlash(value)).toEqual({ account: "Acme Running — Ads (Café)", identity: "Ali Umair" });
  });

  it("names the account and the signed-in profile", () => {
    expect(describeConnectFlash({ account: "@umairlodhi223 (Anavyst)", identity: "Ali Umair" }))
      .toBe("@umairlodhi223 (Anavyst) · signed in as Ali Umair");
    // Several accounts and none picked yet: only the identity is known.
    expect(describeConnectFlash({ account: null, identity: "Ahmad Ali" })).toBe("signed in as Ahmad Ali");
  });

  it("ignores missing, empty or tampered values", () => {
    expect(decodeConnectFlash(undefined)).toBeNull();
    expect(decodeConnectFlash("not base64 !!")).toBeNull();
    expect(decodeConnectFlash(encodeConnectFlash({ account: "", identity: " " }))).toBeNull();
    expect(describeConnectFlash(null)).toBeUndefined();
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { getAuthUrl } from "./google";
import { googleAdsOAuth, googleOAuth, youtubeOAuth } from "./integrations/oauth/google";

// Each Google connection must ask for its own scopes only. With
// include_granted_scopes, every scope the account had ever granted Anavyst
// rode along — so after someone connected YouTube (under Google review),
// connecting Google Ads or Search Console showed "Google hasn't verified this
// app" for a scope that connection never needed.

beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://tryreportflow.com/api/google/callback";
});

const params = (url: string) => new URL(url).searchParams;

describe("Google sign-in links", () => {
  it("never fold previously granted scopes into a new request", () => {
    for (const url of [getAuthUrl("s"), googleOAuth.authUrl("s"), googleAdsOAuth.authUrl("s"), youtubeOAuth.authUrl("s")]) {
      expect(params(url).has("include_granted_scopes")).toBe(false);
    }
  });

  it("ask Google Ads for the Ads scope only, and nothing from YouTube or Search Console", () => {
    const scopes = (params(googleAdsOAuth.authUrl("s")).get("scope") ?? "").split(" ");
    expect(scopes).toEqual(["openid", "email", "https://www.googleapis.com/auth/adwords"]);
  });

  it("still request offline access with a fresh consent, so a refresh token comes back", () => {
    const p = params(googleAdsOAuth.authUrl("s"));
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("redirect_uri")).toBe("https://tryreportflow.com/api/google/callback");
  });
});

// Google OAuth backend — shared by every Google data source. Each product
// family gets a scope-specific variant (same app, same callback, same token
// machinery — only the consent scopes differ), mirroring how instagramOAuth
// varies metaOAuth. Wraps the pure helpers in lib/google.ts so the redirect
// URI stays in one place.
import { getAuthUrl, exchangeCode, refreshAccessToken, getGoogleEmail } from "@/lib/google";
import type { OAuthProvider } from "../types";

// openid+email are always included so identity() can label the connection.
function googleVariant(id: string, extraScopes: string[]): OAuthProvider {
  const scopes = ["openid", "email", ...extraScopes];
  return {
    id,
    authUrl: (state) => getAuthUrl(state, scopes),
    exchangeCode: (code) => exchangeCode(code),
    refresh: (refreshToken) => refreshAccessToken(refreshToken),
    identity: (accessToken) => getGoogleEmail(accessToken),
    // Registered in Google Cloud Console — do not change without updating it there.
    callbackPath: "/api/google/callback",
  };
}

export const googleOAuth: OAuthProvider = {
  ...googleVariant("google", [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
  ]),
  // Keep the historical default (uses lib/google.ts SCOPES) for GSC + GA4.
  authUrl: (state) => getAuthUrl(state),
};

export const googleAdsOAuth = googleVariant("google_ads", ["https://www.googleapis.com/auth/adwords"]);
export const gbpOAuth = googleVariant("gbp", ["https://www.googleapis.com/auth/business.manage"]);
export const sheetsOAuth = googleVariant("sheets", [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
]);

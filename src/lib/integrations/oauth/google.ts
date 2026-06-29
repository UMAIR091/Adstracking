// Google OAuth backend — shared by every Google data source (Search Console,
// GA4, and future Google Ads / Business Profile). Wraps the pure helpers in
// lib/google.ts so the redirect URI and scopes stay in one place.
import { getAuthUrl, exchangeCode, refreshAccessToken, getGoogleEmail } from "@/lib/google";
import type { OAuthProvider } from "../types";

export const googleOAuth: OAuthProvider = {
  id: "google",
  authUrl: (state) => getAuthUrl(state),
  exchangeCode: (code) => exchangeCode(code),
  refresh: (refreshToken) => refreshAccessToken(refreshToken),
  identity: (accessToken) => getGoogleEmail(accessToken),
  // Registered in Google Cloud Console — do not change without updating it there.
  callbackPath: "/api/google/callback",
};

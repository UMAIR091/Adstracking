// Marks the browser that signed up, so the confirmation link knows where it was
// opened. In the signup browser it continues into setup; anywhere else (the
// phone's mail app, a second browser) it only confirms the address, while the
// original window carries on by itself (components/VerifyEmail). Without this,
// both windows opened the same first-run setup.
//
// The cookie holds no identity, only "a signup is waiting in this browser",
// and lasts a day, like the confirmation link.
export const SIGNUP_MARKER = "anv_signup_pending";
const MAX_AGE_S = 24 * 60 * 60;

// Client side: call right after signUp (or a sign-in refused as unconfirmed).
export function markSignupBrowser(): void {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIGNUP_MARKER}=1; Path=/; Max-Age=${MAX_AGE_S}; SameSite=Lax${secure}`;
}

// Client side: the signup window has continued, so nothing is waiting here.
export function clearSignupMarker(): void {
  document.cookie = `${SIGNUP_MARKER}=; Path=/; Max-Age=0; SameSite=Lax`;
}

// Server side: does this request come from the browser that signed up?
export function hasSignupMarker(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((part) => part.trim().startsWith(`${SIGNUP_MARKER}=`));
}

// Product analytics — event catalog + client-side tracking (launch audit P0-4).
// Backed by PostHog, gated on NEXT_PUBLIC_POSTHOG_KEY so it's a safe no-op until
// configured. Import ANALYTICS from anywhere for a stable, typo-proof event name;
// call track() from client components.
import posthog from "posthog-js";

// Canonical event names — one source of truth so dashboards/funnels stay stable.
export const ANALYTICS = {
  signedUp: "signed_up",
  emailVerified: "email_verified",
  onboardingStarted: "onboarding_started",
  onboardingCompleted: "onboarding_completed",
  workspaceCreated: "workspace_created",
  clientCreated: "client_created",
  integrationConnected: "integration_connected",
  syncCompleted: "first_sync_completed",
  reportGenerated: "report_generated",
  reportDelivered: "report_delivered",
  teamInviteSent: "team_invite_sent",
  teamInviteAccepted: "team_invite_accepted",
  scheduleCreated: "schedule_created",
  pdfDownloaded: "pdf_downloaded",
  reportShared: "report_shared",
  checkoutStarted: "checkout_started",
  trialStarted: "trial_started",
  trialConverted: "trial_converted",
  subscriptionUpgraded: "subscription_upgraded",
  subscriptionCancelled: "subscription_cancelled",
  feedbackSubmitted: "feedback_submitted",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS)[keyof typeof ANALYTICS];

export function analyticsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}

// Client-side event. Safe no-op if PostHog isn't loaded/configured.
export function track(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
  try {
    if (!analyticsEnabled() || typeof window === "undefined") return;
    posthog.capture(event, properties);
  } catch {
    /* analytics must never break the app */
  }
}

// Associate subsequent events with a known user (call after auth).
export function identify(distinctId: string, properties?: Record<string, unknown>): void {
  try {
    if (!analyticsEnabled() || typeof window === "undefined") return;
    posthog.identify(distinctId, properties);
  } catch {
    /* ignore */
  }
}

export function resetAnalytics(): void {
  try {
    if (!analyticsEnabled() || typeof window === "undefined") return;
    posthog.reset();
  } catch {
    /* ignore */
  }
}

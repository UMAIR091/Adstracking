"use client";

// Associates the current session's events with the signed-in user (launch audit
// P0-4). Mounted in the dashboard layout; no-op unless analytics is configured.
import { useEffect } from "react";
import { identify } from "@/lib/analytics";

export function AnalyticsIdentify({ userId, email, agencyName }: { userId: string; email: string | null; agencyName: string | null }) {
  useEffect(() => {
    identify(userId, { email: email ?? undefined, agency_name: agencyName ?? undefined });
  }, [userId, email, agencyName]);
  return null;
}

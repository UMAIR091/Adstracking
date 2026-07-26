"use client";

// Initializes PostHog in the browser and auto-captures page views on route
// change (launch audit P0-4). Mounted once at the app root. No-op (renders
// children only) unless NEXT_PUBLIC_POSTHOG_KEY is set, so it's safe to ship now
// and turn on later by adding the key.
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";

let initialized = false;

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ready = useRef(false);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || initialized) {
      ready.current = initialized;
      return;
    }
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      // We fire our own $pageview on navigation (App Router SPA transitions).
      capture_pageview: false,
      capture_pageleave: true,
      persistence: "localStorage+cookie",
    });
    initialized = true;
    ready.current = true;
  }, []);

  // Page view on every route change.
  useEffect(() => {
    if (!ready.current) return;
    try {
      posthog.capture("$pageview", { $current_url: window.location.href });
    } catch {
      /* ignore */
    }
  }, [pathname, searchParams]);

  return <>{children}</>;
}

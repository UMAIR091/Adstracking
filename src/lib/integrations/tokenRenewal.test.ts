import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { reconnectDeadline, renewalFor, renewAheadMs, EXTEND_AHEAD_MS, EXPIRY_BUFFER_MS } from "./tokenRenewal";
import { tokenState } from "@/lib/integrationHealth";

// Facebook Login tokens can't be extended (re-exchanging returns the same
// expiry), so those connections warn ahead of the date; Instagram sign-in
// tokens extend themselves; everything else refreshes as before.

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 17, 12);
const inDays = (d: number) => new Date(NOW + d * DAY).toISOString();

describe("renewal per connection", () => {
  it("knows which tokens extend, which need a reconnect, and which refresh", () => {
    expect(renewalFor({ type: "meta_ads", config: {} })).toBe("reconnect");
    expect(renewalFor({ type: "instagram", config: {} })).toBe("reconnect"); // pre-17 Oct = Facebook
    expect(renewalFor({ type: "instagram", config: { identity_provider: "facebook" } })).toBe("reconnect");
    expect(renewalFor({ type: "instagram", config: { identity_provider: "instagram" } })).toBe("extend");
    expect(renewalFor({ type: "gsc", config: {} })).toBe("refresh");
    expect(renewAheadMs({ type: "instagram", config: { identity_provider: "instagram" } })).toBe(EXTEND_AHEAD_MS);
    expect(renewAheadMs({ type: "linkedin_ads", config: {} })).toBe(EXPIRY_BUFFER_MS);
  });

  it("gives a reconnect deadline only for Facebook tokens within 14 days", () => {
    expect(reconnectDeadline({ type: "meta_ads", config: {}, token_expires_at: inDays(10) }, NOW)).toBe(inDays(10));
    expect(reconnectDeadline({ type: "meta_ads", config: {}, token_expires_at: inDays(-1) }, NOW)).toBe(inDays(-1));
    expect(reconnectDeadline({ type: "meta_ads", config: {}, token_expires_at: inDays(30) }, NOW)).toBeNull();
    expect(reconnectDeadline({ type: "instagram", config: { identity_provider: "instagram" }, token_expires_at: inDays(5) }, NOW)).toBeNull();
    expect(reconnectDeadline({ type: "gsc", config: {}, token_expires_at: inDays(-1) }, NOW)).toBeNull();
  });
});

describe("health page token column", () => {
  it("dates Facebook tokens and warns as the date nears", () => {
    expect(tokenState("connected", inDays(59), "reconnect", NOW)).toEqual({ state: "valid_until", label: "Valid until 15 Dec 2026" });
    expect(tokenState("connected", inDays(10), "reconnect", NOW)).toEqual({ state: "expiring", label: "Reconnect by 27 Oct 2026" });
    expect(tokenState("connected", inDays(-1), "reconnect", NOW).state).toBe("reconnect");
  });

  it("keeps refresh-token connections as auto-refreshing, even when expired", () => {
    expect(tokenState("connected", inDays(-1), "refresh", NOW)).toEqual({ state: "auto_refresh", label: "Auto-refreshing" });
    expect(tokenState("connected", inDays(5), "extend", NOW).state).toBe("auto_refresh");
    expect(tokenState("revoked", inDays(30), "reconnect", NOW).state).toBe("reconnect");
  });
});

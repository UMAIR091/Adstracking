// Client connect links (migration 0048): an agency sends a client
// /connect/<token>, and the client connects their own accounts from their own
// device with no Anavyst login, so their passwords never touch the agency.
//
// The token is 256 random bits and only its SHA-256 is stored, so the link is
// shown once, when created. A link names one client and the platforms it may
// connect, lasts LINK_TTL_DAYS and can be revoked. Sign-ins made through it
// belong to that client alone (connections.client_id).
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { availableIdentityProviders, getIntegration, getOAuthProvider, isLive } from "@/lib/integrations/registry";
import type { IdentityProviderOption, IntegrationDef } from "@/lib/integrations/types";

export const LINK_TTL_DAYS = 7;
// Ties the provider round trip to the browser that started it, and lets the
// OAuth callback find its way back to the link page.
export const LINK_COOKIE = "connect_link";

export function newLinkToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashLinkToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// A plausible token: base64url, the length newLinkToken produces. Anything
// else is rejected before it reaches the database.
export function isLinkToken(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);
}

export function linkUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://tryreportflow.com").replace(/\/$/, "");
  return `${base}/connect/${token}`;
}

// What a client can connect through a link: platforms signed in through the
// generic OAuth flow. Not API-key platforms (clients shouldn't be pasting
// secret keys), not ones that need a store or sheet first (Shopify,
// WooCommerce, Sheets), and not X, whose sign-in has its own flow.
export function linkConnectable(def: IntegrationDef | undefined): def is IntegrationDef {
  return Boolean(
    def &&
      isLive(def.id) &&
      def.authKind !== "apikey" &&
      !def.connectField &&
      def.listAccounts &&
      def.buildConfig &&
      getOAuthProvider(def.oauthProviderId)
  );
}

// The sign-in choices a client gets on a link. The client is no platform
// admin, so admin-only previews (Instagram sign-in before Meta approves it)
// stay hidden.
export function linkSignInOptions(def: IntegrationDef): IdentityProviderOption[] {
  return availableIdentityProviders(def, false);
}

export type LinkBranding = { name: string; logoUrl: string | null; brandColor: string | null };

export type ConnectLink = {
  id: string;
  agencyId: string;
  clientId: string;
  clientName: string;
  types: string[];
  expiresAt: string;
  agency: LinkBranding;
};

export type LinkLookup =
  | { ok: true; link: ConnectLink }
  | { ok: false; reason: "unknown" }
  | { ok: false; reason: "expired" | "revoked" | "archived"; agency: LinkBranding };

type LinkRow = {
  id: string;
  agency_id: string;
  client_id: string;
  types: string[];
  expires_at: string;
  revoked_at: string | null;
  agencies: { name: string | null; logo_url: string | null; brand_color: string | null } | null;
  clients: { name: string | null; archived: boolean | null } | null;
};

// Loads a link by its token with the service role (the visitor has no
// session), together with the agency branding the page shows.
export async function loadConnectLink(admin: SupabaseClient, token: string, now = Date.now()): Promise<LinkLookup> {
  if (!isLinkToken(token)) return { ok: false, reason: "unknown" };
  const { data } = await admin
    .from("connect_links")
    .select("id, agency_id, client_id, types, expires_at, revoked_at, agencies(name, logo_url, brand_color), clients(name, archived)")
    .eq("token_hash", hashLinkToken(token))
    .maybeSingle();
  const row = data as unknown as LinkRow | null;
  if (!row) return { ok: false, reason: "unknown" };

  const agency: LinkBranding = {
    name: row.agencies?.name?.trim() || "Your agency",
    logoUrl: row.agencies?.logo_url ?? null,
    brandColor: row.agencies?.brand_color ?? null,
  };
  if (row.revoked_at) return { ok: false, reason: "revoked", agency };
  if (new Date(row.expires_at).getTime() <= now) return { ok: false, reason: "expired", agency };
  if (row.clients?.archived) return { ok: false, reason: "archived", agency };

  return {
    ok: true,
    link: {
      id: row.id,
      agencyId: row.agency_id,
      clientId: row.client_id,
      clientName: row.clients?.name?.trim() || "your business",
      types: row.types.filter((t) => linkConnectable(getIntegration(t))),
      expiresAt: row.expires_at,
      agency,
    },
  };
}

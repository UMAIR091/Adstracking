// WooCommerce backend. WooCommerce uses its own per-store authorization
// endpoint (/wc-auth/v1/authorize): the store owner approves read access and
// WooCommerce POSTs a consumer key/secret pair to our callback (server-to-
// server, no user session). Those keys never expire — revocation shows up as a
// 401 and surfaces as a reconnect prompt. Data is normalized into the shared
// CommerceReport shape (metrics.ts), identical to Shopify, so storefronts read
// the same everywhere. No app-level credentials are needed, so it's always live.
import type { IntegrationAccount, OAuthProvider, TokenSet } from "../types";
import { encrypt, decrypt } from "@/lib/crypto";
import { safeFetch } from "@/lib/ssrf";
import { isoDay, ratio, withRetry, type CommerceDay, type CommerceReport, type CommerceTotals } from "../metrics";

const API_VERSION = "wc/v3";

// The `state` travels through WooCommerce (authorize URL → return_url query and
// the server-to-server callback POST), so it must be tamper-proof AND URL-safe.
// Encrypt the payload (AES-GCM), then base64url so it survives echoing intact.
export type WooState = { clientId: string; storeUrl: string; nonce: string };
export function signWooState(payload: WooState): string {
  return Buffer.from(encrypt(JSON.stringify(payload)), "utf8").toString("base64url");
}
export function readWooState(state: string): WooState {
  return JSON.parse(decrypt(Buffer.from(state, "base64url").toString("utf8"))) as WooState;
}
// Order statuses that represent real sales (exclude cancelled/refunded/failed).
const COUNTED_STATUSES = new Set(["completed", "processing", "on-hold"]);
const FIVE_YEARS = 5 * 365 * 24 * 60 * 60;

// The key pair is stored as a single "consumer_key:consumer_secret" access
// token so it flows through the generic sync (which only passes a token + the
// account id). The store base URL is the account id.
export function packWooToken(consumerKey: string, consumerSecret: string): string {
  return `${consumerKey}:${consumerSecret}`;
}
function unpackWooToken(token: string): { key: string; secret: string } {
  const idx = token.indexOf(":");
  return idx === -1 ? { key: token, secret: "" } : { key: token.slice(0, idx), secret: token.slice(idx + 1) };
}

// Accepts "store.com", "https://store.com", or a URL with a path; returns the
// canonical https origin (no trailing slash) or null when it can't be a URL.
export function normalizeStoreUrl(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^https?:\/\//.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname.includes(".")) return null;
    // Force https — WooCommerce requires it for the auth callback.
    return `https://${u.host}`;
  } catch {
    return null;
  }
}

// Builds the store's authorization URL. WooCommerce redirects the store owner
// to approve, then POSTs the generated keys to callback_url and sends the
// browser to return_url.
export function wooAuthUrl(storeUrl: string, state: string, returnUrl: string, callbackUrl: string): string {
  const params = new URLSearchParams({
    app_name: "ReportFlow",
    scope: "read",
    user_id: state,
    return_url: returnUrl,
    callback_url: callbackUrl,
  });
  return `${storeUrl}/wc-auth/v1/authorize?${params.toString()}`;
}

// Registered so the generic machinery can resolve callbackPath and produce a
// clear reconnect message; the connect flow itself uses the dedicated routes.
export const woocommerceOAuth: OAuthProvider = {
  id: "woocommerce",
  authUrl: () => {
    throw new Error("WooCommerce connects via /api/woocommerce/connect (needs a store URL).");
  },
  exchangeCode: () => {
    throw new Error("WooCommerce credentials arrive on the callback, not via code exchange.");
  },
  refresh: async () => {
    throw new Error("WooCommerce access was revoked. Please reconnect the store.");
  },
  identity: async () => "WooCommerce store",
  callbackPath: "/api/woocommerce/callback",
};

function authHeader(consumerKey: string, consumerSecret: string): string {
  return `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`;
}

async function wooGet<T>(
  storeUrl: string, consumerKey: string, consumerSecret: string, path: string
): Promise<{ body: T; totalPages: number }> {
  // SSRF-safe: validates the store URL, pins the resolved IP at connect time,
  // and re-checks every redirect hop (blocks rebinding + redirect-to-internal).
  return withRetry(async () => {
    const res = await safeFetch(`${storeUrl}/wp-json/${API_VERSION}${path}`, {
      headers: { Authorization: authHeader(consumerKey, consumerSecret), Accept: "application/json" },
    });
    if (res.status === 429) throw new Error("WooCommerce rate limit (429)"); // withRetry backs off
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (body as { message?: string }).message ?? res.statusText;
      throw new Error(`WooCommerce API error: ${detail} (${res.status})`);
    }
    return { body: body as T, totalPages: Number(res.headers.get("x-wp-totalpages") ?? 1) };
  });
}

// Verifies a freshly received key pair works and returns the store's display
// name (from the unauthenticated WP REST root), falling back to the host.
export async function getWooStoreName(storeUrl: string, consumerKey: string, consumerSecret: string): Promise<string> {
  // A cheap authenticated call to confirm the keys are valid (throws otherwise).
  await wooGet(storeUrl, consumerKey, consumerSecret, "/orders?per_page=1&_fields=id");
  try {
    const res = await safeFetch(`${storeUrl}/wp-json`, { headers: { Accept: "application/json" } }); // SSRF-safe probe
    const data = (await res.json().catch(() => ({}))) as { name?: string };
    const host = new URL(storeUrl).host;
    return data.name ? `${data.name} (${host})` : host;
  } catch {
    return new URL(storeUrl).host;
  }
}

type WooOrder = {
  date_created_gmt?: string;
  total?: string;
  currency?: string;
  status?: string;
  customer_id?: number;
  line_items?: { name?: string; quantity?: number; total?: string }[];
};

async function listOrders(
  storeUrl: string, consumerKey: string, consumerSecret: string, afterIso: string, beforeIso: string
): Promise<WooOrder[]> {
  const out: WooOrder[] = [];
  // Cap pagination so a huge store can't stall the sync (10 pages × 100).
  for (let page = 1; page <= 10; page++) {
    const q =
      `/orders?after=${afterIso}T00:00:00&before=${beforeIso}T23:59:59&dates_are_gmt=true` +
      `&per_page=100&page=${page}&orderby=date&order=desc` +
      `&_fields=date_created_gmt,total,currency,status,customer_id,line_items`;
    const { body, totalPages } = await wooGet<WooOrder[]>(storeUrl, consumerKey, consumerSecret, q);
    out.push(...(Array.isArray(body) ? body : []));
    if (page >= totalPages) break;
  }
  return out;
}

function commerceTotals(orders: WooOrder[]): CommerceTotals {
  const revenue = orders.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const customers = new Set(orders.map((o) => o.customer_id).filter((id) => id && id > 0)).size;
  return { orders: orders.length, revenue, avgOrderValue: ratio(revenue, orders.length), customers };
}

// Fetches the normalized commerce report for one store and period, plus the
// prior equal-length period for comparison. accountId = the store base URL.
export async function fetchWooReport(accessToken: string, storeUrl: string, periodDays: number): Promise<CommerceReport> {
  const { key, secret } = unpackWooToken(accessToken);
  const since = isoDay(periodDays);
  const until = isoDay(1);

  const [rawOrders, rawPrev] = await Promise.all([
    listOrders(storeUrl, key, secret, since, until),
    listOrders(storeUrl, key, secret, isoDay(periodDays * 2), isoDay(periodDays + 1)).catch((err) => {
      console.error(`[woocommerce] previous period: ${(err as Error).message}`);
      return [] as WooOrder[];
    }),
  ]);

  // Keep only revenue-generating statuses (exclude cancelled/refunded/failed).
  const orders = rawOrders.filter((o) => COUNTED_STATUSES.has(o.status ?? ""));
  const prevOrders = rawPrev.filter((o) => COUNTED_STATUSES.has(o.status ?? ""));

  const byDay = new Map<string, CommerceDay>();
  for (let i = periodDays; i >= 1; i--) byDay.set(isoDay(i), { date: isoDay(i), orders: 0, revenue: 0 });
  const products = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const o of orders) {
    const day = byDay.get((o.date_created_gmt ?? "").slice(0, 10));
    if (day) {
      day.orders += 1;
      day.revenue += Number(o.total ?? 0);
    }
    for (const li of o.line_items ?? []) {
      const name = li.name ?? "—";
      const p = products.get(name) ?? { name, quantity: 0, revenue: 0 };
      p.quantity += li.quantity ?? 0;
      p.revenue += Number(li.total ?? 0);
      products.set(name, p);
    }
  }

  return {
    platform: "woocommerce",
    currency: orders[0]?.currency ?? "USD",
    totals: commerceTotals(orders),
    previousTotals: prevOrders.length ? commerceTotals(prevOrders) : null,
    byDate: Array.from(byDay.values()),
    topProducts: Array.from(products.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
  };
}

// The key pair never expires; store a far-future horizon like Shopify's
// offline token so the sync never tries to "refresh" it.
export function wooTokenSet(consumerKey: string, consumerSecret: string): TokenSet {
  return { access_token: packWooToken(consumerKey, consumerSecret), expires_in: FIVE_YEARS };
}

// The account is the store itself — the config the connect callback stores.
export function wooConfig(storeUrl: string, displayName: string): { accounts: IntegrationAccount[]; account_id: string } {
  return { accounts: [{ id: storeUrl, name: displayName }], account_id: storeUrl };
}

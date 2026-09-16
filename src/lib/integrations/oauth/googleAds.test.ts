// Google Ads connector against a fake Google Ads REST API.
//
// Pins the three things that broke the connector without anyone noticing:
// the retired API version (v21 answers every call with a 404), the pageSize
// field (rejected with PAGE_SIZE_NOT_SUPPORTED since v17), and agencies' client
// accounts, which are only reachable through their manager (MCC) account and
// need that manager in the login-customer-id header on every call.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchGoogleAdsReport, listGoogleAdsAccounts, parseGoogleAdsAccountId } from "./googleAds";
import { isoDay } from "../metrics";

type Call = { url: string; body: { query?: string; pageToken?: string; pageSize?: number } | null; login: string | null };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const adsFailure = (status: number, errorCode: Record<string, string>, message: string) =>
  json(status, {
    error: {
      code: status,
      message: "The caller does not have permission",
      details: [{ "@type": "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure", errors: [{ errorCode, message }] }],
    },
  });

let calls: Call[];

// route(call) returns the Response for one request.
function fakeApi(route: (call: Call) => Response) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const hdrs = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      login: hdrs["login-customer-id"] ?? null,
    };
    calls.push(call);
    return route(call);
  }));
}

const customerOf = (url: string) => url.match(/customers\/(\d+)\/googleAds:search/)?.[1];

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("parseGoogleAdsAccountId", () => {
  it("reads a manager-routed id and a direct id", () => {
    expect(parseGoogleAdsAccountId("3333333333@1111111111")).toEqual({ customerId: "3333333333", loginCustomerId: "1111111111" });
    expect(parseGoogleAdsAccountId("222-222-2222")).toEqual({ customerId: "2222222222", loginCustomerId: "2222222222" });
  });
});

describe("listGoogleAdsAccounts", () => {
  it("expands a manager into its enabled client accounts and keeps direct accounts direct", async () => {
    fakeApi(({ url, body }) => {
      if (url.endsWith("/customers:listAccessibleCustomers")) {
        return json(200, { resourceNames: ["customers/1111111111", "customers/2222222222", "customers/4444444444"] });
      }
      const customer = customerOf(url);
      const q = body?.query ?? "";
      if (customer === "4444444444") return adsFailure(403, { authorizationError: "CUSTOMER_NOT_ENABLED" }, "The customer account can't be accessed because it is not yet enabled or has been deactivated.");
      if (q.includes("FROM customer LIMIT 1")) {
        return customer === "1111111111"
          ? json(200, { results: [{ customer: { id: "1111111111", descriptiveName: "Agency MCC", manager: true } }] })
          : json(200, { results: [{ customer: { id: "2222222222", descriptiveName: "Direct Shop" } }] });
      }
      if (q.includes("FROM customer_client") && customer === "1111111111") {
        return json(200, {
          results: [
            { customerClient: { id: "1111111111", descriptiveName: "Agency MCC", manager: true, status: "ENABLED" } },
            { customerClient: { id: "3333333333", descriptiveName: "Client A", status: "ENABLED" } },
            { customerClient: { id: "2222222222", descriptiveName: "Direct Shop", status: "ENABLED" } },
            { customerClient: { id: "5555555555", descriptiveName: "Sub-manager", manager: true, status: "ENABLED" } },
            { customerClient: { id: "6666666666", descriptiveName: "Old client", status: "CANCELED" } },
          ],
        });
      }
      return json(500, {});
    });

    const accounts = await listGoogleAdsAccounts("token");

    expect(accounts).toEqual([
      { id: "3333333333@1111111111", name: "Client A (333-333-3333)" },
      { id: "2222222222", name: "Direct Shop (222-222-2222)" },
    ]);
    // Reading the manager's hierarchy runs as the manager itself.
    const hierarchy = calls.find((c) => c.body?.query?.includes("FROM customer_client"));
    expect(hierarchy?.login).toBe("1111111111");
    expect(calls.every((c) => c.url.startsWith("https://googleads.googleapis.com/v25/"))).toBe(true);
  });

  it("returns no accounts for a Google account without Google Ads", async () => {
    fakeApi(() => adsFailure(403, { authenticationError: "NOT_ADS_USER" }, "The login email is not associated with any Google Ads account."));
    await expect(listGoogleAdsAccounts("token")).resolves.toEqual([]);
  });

  it("surfaces Google's specific error instead of the generic one", async () => {
    fakeApi(() => adsFailure(403, { authorizationError: "DEVELOPER_TOKEN_PROHIBITED" }, "Project is not allowed to use this API."));
    await expect(listGoogleAdsAccounts("token")).rejects.toThrow(
      "Google Ads API error 403 DEVELOPER_TOKEN_PROHIBITED: Project is not allowed to use this API."
    );
  });
});

describe("fetchGoogleAdsReport", () => {
  it("queries a client account through its manager, without pageSize, following every page", async () => {
    const yesterday = isoDay(1);
    fakeApi(({ body }) => {
      const q = body?.query ?? "";
      if (q.includes("customer.currency_code")) return json(200, { results: [{ customer: { currencyCode: "PKR" } }] });
      if (q.includes("segments.date,") && !body?.pageToken) {
        return json(200, {
          results: [{ segments: { date: yesterday }, metrics: { costMicros: "1500000", impressions: "100", clicks: "10", conversions: 1 } }],
          nextPageToken: "page-2",
        });
      }
      if (q.includes("segments.date,") && body?.pageToken === "page-2") {
        return json(200, { results: [{ segments: { date: yesterday }, metrics: { costMicros: "500000", impressions: "50", clicks: "5", conversions: 1 } }] });
      }
      return json(200, { results: [] });
    });

    const report = await fetchGoogleAdsReport("token", "3333333333@1111111111", 7);

    expect(report.currency).toBe("PKR");
    expect(report.totals.spend).toBeCloseTo(2);
    expect(report.totals.impressions).toBe(150);
    expect(report.totals.clicks).toBe(15);
    for (const c of calls) {
      expect(c.url).toBe("https://googleads.googleapis.com/v25/customers/3333333333/googleAds:search");
      expect(c.login).toBe("1111111111");
      expect(c.body).not.toHaveProperty("pageSize");
    }
    expect(calls.some((c) => c.body?.pageToken === "page-2")).toBe(true);
  });
});

// "Refresh now" on a connection with no account chosen re-reads the provider's
// account list. Before this route existed the button ran a sync, which stops
// at "No ad account selected", so an account created after connecting (a
// Google Ads account added under a manager) never appeared until the user
// disconnected and connected again.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { IntegrationAccount } from "@/lib/integrations/types";

type Row = { id: string; agency_id: string; type: string; config: Record<string, unknown> | null; access_token: string; refresh_token: string; token_expires_at: string | null };

let user: { id: string } | null;
let row: Row | null;
let updates: Record<string, unknown>[];
let listed: IntegrationAccount[] | Error;
let hasAccountList: boolean;

const syncDataSource = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
const listAccounts = vi.fn(async (_token: string, _ctx?: { provider?: string }) => {
  if (listed instanceof Error) throw listed;
  return listed;
});

vi.mock("@/lib/sync", () => ({ syncDataSource: (...args: unknown[]) => syncDataSource(...args) }));
vi.mock("@/lib/googleTokens", () => ({ getValidAccessToken: async () => "access-token" }));
vi.mock("@/lib/integrations/registry", () => ({
  // Shaped like googleAdsDef: list + config key, one account is picked automatically.
  getIntegration: () =>
    hasAccountList
      ? {
          id: "google_ads",
          accountConfigKey: "account_id",
          listAccounts,
          buildConfig: (accounts: IntegrationAccount[]) => ({ accounts, account_id: accounts.length === 1 ? accounts[0].id : null }),
          readSelected: (cfg: Record<string, unknown>) => (cfg.account_id as string | null) ?? null,
        }
      : { id: "klaviyo", accountConfigKey: "account_id" },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

let POST: (req: Request) => Promise<Response>;
beforeAll(async () => {
  ({ POST } = await import("./route"));
});

const refresh = () =>
  POST(new Request("https://example.com/api/google/accounts", { method: "POST", body: JSON.stringify({ dataSourceId: "ds-1" }) }));

beforeEach(() => {
  vi.clearAllMocks();
  user = { id: "user-1" };
  hasAccountList = true;
  updates = [];
  listed = [];
  row = {
    id: "ds-1",
    agency_id: "agency-1",
    type: "google_ads",
    config: { accounts: [], account_id: null, identity_provider: "google" },
    access_token: "enc",
    refresh_token: "enc",
    token_expires_at: null,
  };
});

describe("POST /api/google/accounts", () => {
  it("picks up an account created after connecting, selects it and syncs", async () => {
    listed = [{ id: "3333333333@6479121847", name: "Anavyst Demo (333-333-3333)" }];

    const res = await refresh();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, accounts: 1 });
    expect(updates).toEqual([
      { config: { accounts: listed, account_id: "3333333333@6479121847", identity_provider: "google" } },
    ]);
    expect(listAccounts).toHaveBeenCalledWith("access-token", { provider: "google" });
    expect(syncDataSource).toHaveBeenCalledTimes(1);
  });

  it("stores the refreshed list without syncing when there is still nothing to pick", async () => {
    listed = [];

    const res = await refresh();

    expect(await res.json()).toEqual({ ok: true, accounts: 0 });
    expect(updates).toHaveLength(1);
    expect(syncDataSource).not.toHaveBeenCalled();
  });

  it("keeps an account the user already chose", async () => {
    row!.config = { accounts: [], account_id: "1111111111" };
    listed = [
      { id: "1111111111", name: "A (111-111-1111)" },
      { id: "2222222222", name: "B (222-222-2222)" },
    ];

    await refresh();

    expect(updates[0]).toEqual({ config: { accounts: listed, account_id: "1111111111" } });
  });

  it("reports the provider's error and leaves the connection untouched", async () => {
    listed = new Error("Google Ads API error 403 USER_PERMISSION_DENIED: User doesn't have permission to access customer.");

    const res = await refresh();

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("USER_PERMISSION_DENIED");
    expect(updates).toHaveLength(0);
  });

  it("rejects integrations that have no account list", async () => {
    hasAccountList = false;
    expect((await refresh()).status).toBe(400);
  });

  it("requires a signed-in user", async () => {
    user = null;
    expect((await refresh()).status).toBe(401);
    expect(updates).toHaveLength(0);
  });

  it("does not reveal other agencies' sources", async () => {
    row = null;
    expect((await refresh()).status).toBe(404);
  });
});

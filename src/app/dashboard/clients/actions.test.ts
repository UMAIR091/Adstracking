// Creating a client and restoring an archived one are the two ways to add to
// the plan's client count. Tenants can no longer do either with a direct write
// (migration 0038), so these actions are the enforcement point: they refuse at
// the limit, and they write through the locking database functions (0037)
// rather than a plain insert or update that concurrent requests could race.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const checkClientLimit = vi.fn();
const rpc = vi.fn();
const userUpdates: { patch: unknown; filters: [string, unknown][] }[] = [];
let signedIn = true;

vi.mock("@/lib/agency", () => ({
  getCurrentUserAndAgency: async () =>
    signedIn ? { user: { id: "u1" }, agency: { id: "a1" } } : { user: null, agency: null },
}));
vi.mock("@/lib/billing/limits", () => ({ checkClientLimit: (...a: unknown[]) => checkClientLimit(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: () => ({
      update: (patch: unknown) => {
        const entry = { patch, filters: [] as [string, unknown][] };
        userUpdates.push(entry);
        const chain = {
          eq: (col: string, val: unknown) => {
            entry.filters.push([col, val]);
            return chain;
          },
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(res, rej),
        };
        return chain;
      },
    }),
  }),
}));

let actions: typeof import("./actions");
beforeAll(async () => {
  actions = await import("./actions");
});

const limitCheck = (current: number, limit: number) => ({
  allowed: current < limit,
  current,
  limit,
  plan: "pro",
  planName: "Pro",
  isTrial: false,
  hasAccess: true,
  reason: current < limit ? null : `You've reached your Pro limit of ${limit} clients. Upgrade for more.`,
});

const input = { name: "  Acme  ", logo_url: null, email: null, website: null, notes: null };

beforeEach(() => {
  vi.clearAllMocks();
  userUpdates.length = 0;
  signedIn = true;
});

describe("createClientAction", () => {
  it("refuses at the limit without writing", async () => {
    checkClientLimit.mockResolvedValue(limitCheck(5, 5));

    const res = await actions.createClientAction(input);

    expect(res).toEqual({ ok: false, error: expect.stringContaining("limit of 5"), upgrade: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates through the locking function, passing the plan's limit", async () => {
    checkClientLimit.mockResolvedValue(limitCheck(4, 5));
    rpc.mockResolvedValue({ data: "new-id", error: null });

    const res = await actions.createClientAction(input);

    expect(res).toEqual({ ok: true, id: "new-id" });
    expect(rpc).toHaveBeenCalledWith(
      "create_client_within_limit",
      expect.objectContaining({ p_agency: "a1", p_max_clients: 5, p_name: "Acme" })
    );
  });

  it("reports the limit when a concurrent request took the last slot", async () => {
    checkClientLimit.mockResolvedValueOnce(limitCheck(4, 5)).mockResolvedValueOnce(limitCheck(5, 5));
    rpc.mockResolvedValue({ data: null, error: null });

    const res = await actions.createClientAction(input);

    expect(res).toEqual({ ok: false, error: expect.stringContaining("limit of 5"), upgrade: true });
  });

  it("requires a signed-in user", async () => {
    signedIn = false;

    const res = await actions.createClientAction(input);

    expect(res.ok).toBe(false);
    expect(checkClientLimit).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("setClientArchivedAction", () => {
  it("archives with a plain update scoped to the agency, with no plan check", async () => {
    const res = await actions.setClientArchivedAction("c1", true);

    expect(res).toEqual({ ok: true });
    expect(checkClientLimit).not.toHaveBeenCalled();
    expect(userUpdates).toEqual([{ patch: { archived: true }, filters: [["id", "c1"], ["agency_id", "a1"]] }]);
  });

  it("refuses to restore at the limit", async () => {
    checkClientLimit.mockResolvedValue(limitCheck(1, 1));

    const res = await actions.setClientArchivedAction("c1", false);

    expect(res).toMatchObject({ ok: false, upgrade: true });
    expect(rpc).not.toHaveBeenCalled();
    expect(userUpdates).toHaveLength(0);
  });

  it("restores through the locking function, never a direct update", async () => {
    checkClientLimit.mockResolvedValue(limitCheck(0, 1));
    rpc.mockResolvedValue({ data: "restored", error: null });

    const res = await actions.setClientArchivedAction("c1", false);

    expect(res).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("restore_client_within_limit", { p_agency: "a1", p_client: "c1", p_max_clients: 1 });
    expect(userUpdates).toHaveLength(0);
  });

  it("turns the function's refusals into messages", async () => {
    checkClientLimit.mockResolvedValue(limitCheck(0, 1));
    rpc.mockResolvedValueOnce({ data: "not_found", error: null });
    expect(await actions.setClientArchivedAction("c9", false)).toEqual({ ok: false, error: "Client not found." });

    checkClientLimit.mockResolvedValueOnce(limitCheck(0, 1)).mockResolvedValueOnce(limitCheck(1, 1));
    rpc.mockResolvedValueOnce({ data: "limit", error: null });
    expect(await actions.setClientArchivedAction("c1", false)).toEqual({
      ok: false,
      error: expect.stringContaining("limit of 1"),
      upgrade: true,
    });
  });
});

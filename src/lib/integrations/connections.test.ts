import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationDef } from "./types";

// Shared agency sign-ins (migration 0046): one saved sign-in serves many
// clients, and reconnecting it renews every client on it. These pin what
// saveSignIn writes, and that a reconnect stays inside the agency.

vi.mock("@/lib/crypto", () => ({ encrypt: (s: string) => `enc:${s}` }));

type Call = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] };

// Records every chained query; `result` decides what each terminal returns.
function recorder(result: (c: Call) => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const b = {
        insert(p: unknown) { call.op = "insert"; call.payload = p; return b; },
        update(p: unknown) { call.op = "update"; call.payload = p; return b; },
        upsert(p: unknown) { call.op = "upsert"; call.payload = p; return b; },
        delete() { call.op = "delete"; return b; },
        select() { return b; },
        eq(k: string, v: unknown) { call.filters.push(["eq", k, v]); return b; },
        neq(k: string, v: unknown) { call.filters.push(["neq", k, v]); return b; },
        single: async () => result(call),
        maybeSingle: async () => result(call),
        then(resolve: (v: unknown) => unknown) { return Promise.resolve(result(call)).then(resolve); },
      };
      return b;
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const admin = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin.db }));

import { saveSignIn, isShareable } from "./connections";

const def = { id: "meta_ads", name: "Meta Ads" } as IntegrationDef;
const tokens = { accessToken: "tok", refreshToken: "tok", expiresAt: "2026-12-15T00:00:00.000Z" };
const sourceRow = { id: "ds-1", agency_id: "ag-1", client_id: "c-1", type: "meta_ads", config: { account_id: null }, connection_id: "conn-new" };

let adminRec: ReturnType<typeof recorder>;
let userRec: ReturnType<typeof recorder>;

beforeEach(() => {
  adminRec = recorder((c) =>
    c.table === "connections" && c.op === "insert"
      ? { data: { id: "conn-new" }, error: null }
      : c.table === "connections" && c.op === "update"
        ? { data: c.filters.some(([, k, v]) => k === "agency_id" && v === "ag-1") ? { id: "conn-old" } : null, error: null }
        : { data: null, error: null }
  );
  admin.db = adminRec.db;
  userRec = recorder(() => ({ data: sourceRow, error: null }));
});

describe("saveSignIn", () => {
  it("saves a new sign-in for the agency and points the client at it", async () => {
    const src = await saveSignIn(userRec.db, {
      agencyId: "ag-1", clientId: "c-1", def, tokens, identity: "Ali Umair", config: { account_id: null }, userId: "u-1",
    });

    const insert = adminRec.calls.find((c) => c.table === "connections" && c.op === "insert")!;
    expect(insert.payload).toMatchObject({
      agency_id: "ag-1", type: "meta_ads", created_by: "u-1", display_name: "Ali Umair",
      access_token: "enc:tok", refresh_token: "enc:tok", status: "connected",
    });
    const upsert = userRec.calls.find((c) => c.op === "upsert")!;
    expect(upsert.table).toBe("data_sources");
    expect(upsert.payload).toMatchObject({ client_id: "c-1", connection_id: "conn-new", status: "connected", last_sync_error: null });
    // Tokens are never written to the client's row any more.
    expect(upsert.payload).not.toHaveProperty("access_token");
    expect(src.connection).toMatchObject({ id: "conn-new", access_token: "enc:tok" });
  });

  it("reconnects an existing sign-in inside the agency and revives its other clients", async () => {
    await saveSignIn(userRec.db, {
      agencyId: "ag-1", clientId: "c-1", def, tokens, identity: "Ali Umair", config: {}, connectionId: "conn-old",
    });

    const update = adminRec.calls.find((c) => c.table === "connections" && c.op === "update")!;
    expect(update.filters).toEqual(
      expect.arrayContaining([["eq", "id", "conn-old"], ["eq", "agency_id", "ag-1"], ["eq", "type", "meta_ads"]])
    );
    expect(adminRec.calls.some((c) => c.op === "insert")).toBe(false);
    const revive = adminRec.calls.find((c) => c.table === "data_sources" && c.op === "update")!;
    expect(revive.payload).toEqual({ status: "connected", last_sync_error: null });
    expect(revive.filters).toEqual(expect.arrayContaining([["eq", "connection_id", "conn-old"], ["neq", "client_id", "c-1"]]));
  });

  it("refuses to reconnect a sign-in from another workspace", async () => {
    await expect(
      saveSignIn(userRec.db, { agencyId: "ag-2", clientId: "c-9", def, tokens, identity: "X", config: {}, connectionId: "conn-old" })
    ).rejects.toThrow("no longer exists");
    expect(userRec.calls).toEqual([]);
  });

  it("removes a fresh sign-in again when attaching it to the client fails", async () => {
    userRec = recorder(() => ({ data: null, error: { message: "client not in workspace" } }));
    await expect(
      saveSignIn(userRec.db, { agencyId: "ag-1", clientId: "c-1", def, tokens, identity: "X", config: {} })
    ).rejects.toThrow("client not in workspace");
    const del = adminRec.calls.find((c) => c.table === "connections" && c.op === "delete")!;
    expect(del.filters).toEqual([["eq", "id", "conn-new"]]);
  });
});

describe("isShareable", () => {
  it("shares sign-ins except where a per-client value is collected first", () => {
    const listable = { listAccounts: async () => [], buildConfig: () => ({}) };
    expect(isShareable({ ...def, ...listable } as IntegrationDef)).toBe(true);
    expect(isShareable({ ...def, ...listable, connectField: { name: "shop", label: "Shop", placeholder: "" } } as IntegrationDef)).toBe(false);
    expect(isShareable(undefined)).toBe(false);
  });
});

// The client limit counts ACTIVE clients, so archiving one frees a slot. That is
// only safe if an archived client stops working. Otherwise archive, add, repeat
// keeps any number of clients syncing and reporting on a plan that allows five.
//
// These tests drive the real server actions, the real limit check, and the real
// sync and report-generation paths against an in-memory database, and pin one
// invariant: no more clients can do work than the plan allows. Scheduled
// delivery is covered in scheduledReports.test.ts.
//
// The database is a fake. Its two limit functions mirror
// create_client_within_limit / restore_client_within_limit from migration 0037,
// whose behaviour was checked against Postgres when they shipped.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { limitsForPlan } from "@/lib/billing/config";

type Row = Record<string, unknown>;
type Client = { id: string; agency_id: string; name: string; archived: boolean };

const AGENCY = "a1";
const LIMIT = limitsForPlan("pro").maxClients;

const db: { clients: Client[]; data_sources: Row[] } = { clients: [], data_sources: [] };
const sourceWrites: { id: unknown; patch: Row }[] = [];
let seq = 0;

// A small query builder over `db`, covering the calls these code paths make.
// Tables the tests don't populate read as empty.
function table(name: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let columns = "";
  let head = false;
  let patch: Row | null = null;
  const rows = (): Row[] =>
    ((name === "clients" ? db.clients : name === "data_sources" ? db.data_sources : []) as Row[]).filter((r) =>
      filters.every((f) => f(r))
    );
  const project = (r: Row): Row =>
    columns.includes("clients(archived)")
      ? { ...r, clients: { archived: db.clients.find((c) => c.id === r.client_id)?.archived } }
      : { ...r };
  const chain = {
    select: (cols: string, opts?: { head?: boolean }) => {
      columns = cols;
      head = Boolean(opts?.head);
      return chain;
    },
    update: (p: Row) => {
      patch = p;
      return chain;
    },
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return chain;
    },
    maybeSingle: async () => {
      const r = rows()[0];
      return { data: r ? project(r) : null, error: null };
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      let out: unknown;
      const p = patch;
      if (p) {
        for (const r of rows()) {
          Object.assign(r, p);
          if (name === "data_sources") sourceWrites.push({ id: r.id, patch: p });
        }
        out = { error: null };
      } else if (head) {
        out = { count: rows().length, error: null };
      } else {
        out = { data: rows().map(project), error: null };
      }
      return Promise.resolve(out).then(res, rej);
    },
  };
  return chain;
}

const activeCount = (agency: unknown) => db.clients.filter((c) => c.agency_id === agency && !c.archived).length;

const tenant = { from: table };
const admin = {
  from: table,
  // Mirrors migration 0037: count the agency's active clients, then write.
  rpc: async (fn: string, args: Row) => {
    if (fn === "create_client_within_limit") {
      if (activeCount(args.p_agency) >= (args.p_max_clients as number)) return { data: null, error: null };
      const id = `client-${++seq}`;
      db.clients.push({ id, agency_id: args.p_agency as string, name: args.p_name as string, archived: false });
      return { data: id, error: null };
    }
    if (fn === "restore_client_within_limit") {
      const client = db.clients.find((c) => c.id === args.p_client && c.agency_id === args.p_agency);
      if (!client) return { data: "not_found", error: null };
      if (!client.archived) return { data: "restored", error: null };
      if (activeCount(args.p_agency) >= (args.p_max_clients as number)) return { data: "limit", error: null };
      client.archived = false;
      return { data: "restored", error: null };
    }
    return { data: null, error: null };
  },
};

const getValidAccessToken = vi.fn(async (..._args: unknown[]) => "token");
const trackUsage = vi.fn(async (..._args: unknown[]) => {});

vi.mock("@/lib/agency", () => ({
  getCurrentUserAndAgency: async () => ({ user: { id: "u1" }, agency: { id: AGENCY } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => tenant }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/lib/billing/subscription", () => ({
  getSubscriptionState: async () => ({ plan: "pro", planName: "Pro", hasAccess: true }),
}));
vi.mock("@/lib/billing/limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/limits")>()),
  // The report cap is a separate finding (N2) and not under test here.
  checkReportLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/ai", () => ({ generateReportInsightsCached: async () => ({ insights: null, cached: true }) }));
vi.mock("@/lib/usage", () => ({ trackUsage: (...a: unknown[]) => trackUsage(...a) }));
vi.mock("@/lib/googleTokens", () => ({ getValidAccessToken: (...a: unknown[]) => getValidAccessToken(...a) }));
vi.mock("@/lib/errorLog", () => ({ logError: async () => {}, logRouteError: async () => "" }));

let actions: typeof import("@/app/dashboard/clients/actions");
let syncDataSource: typeof import("./sync").syncDataSource;
let processSources: typeof import("./syncBatch").processSources;
let createClientReport: typeof import("./reportGen").createClientReport;
let checkClientLimit: typeof import("./billing/limits").checkClientLimit;
beforeAll(async () => {
  actions = await import("@/app/dashboard/clients/actions");
  ({ syncDataSource } = await import("./sync"));
  ({ processSources } = await import("./syncBatch"));
  ({ createClientReport } = await import("./reportGen"));
  ({ checkClientLimit } = await import("./billing/limits"));
});

// Every client gets a Search Console source with no site chosen yet. A sync
// that gets past the archive check stops at "no site selected", and report
// generation stops at "connect a data source", both before any provider call.
async function addClient(name: string) {
  const res = await actions.createClientAction({ name, logo_url: null, email: null, website: null, notes: null });
  if (res.ok) db.data_sources.push({ id: `ds-${res.id}`, agency_id: AGENCY, client_id: res.id, type: "gsc", config: {} });
  return res;
}

const archive = (id: string) => actions.setClientArchivedAction(id, true);
const restore = (id: string) => actions.setClientArchivedAction(id, false);

const sourceFor = (clientId: string) => ({
  id: `ds-${clientId}`,
  agency_id: AGENCY,
  client_id: clientId,
  type: "gsc",
  config: {},
  access_token: "enc:access",
  refresh_token: "enc:refresh",
  token_expires_at: null,
});

const canSync = async (clientId: string) => !(await syncDataSource(tenant as never, sourceFor(clientId))).skipped;

async function canCreateReports(clientId: string) {
  const result = await createClientReport(tenant as never, AGENCY, clientId);
  return result.ok || result.status !== 409;
}

// Clients that can still do any work at all.
async function workingClients(): Promise<string[]> {
  const working: string[] = [];
  for (const client of db.clients) {
    if ((await canSync(client.id)) || (await canCreateReports(client.id))) working.push(client.id);
  }
  return working;
}

async function fillToLimit(): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= LIMIT; i++) {
    const res = await addClient(`Client ${i}`);
    if (!res.ok) throw new Error(`client ${i} was refused: ${res.error}`);
    ids.push(res.id);
  }
  return ids;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.clients.length = 0;
  db.data_sources.length = 0;
  sourceWrites.length = 0;
  seq = 0;
});

describe("archiving can't be used to get past the client limit", () => {
  it("at the limit, archiving a client and adding another leaves no more working clients than the plan allows", async () => {
    const [first] = await fillToLimit();
    expect(await addClient("One too many")).toMatchObject({ ok: false, upgrade: true });

    expect(await archive(first)).toEqual({ ok: true });
    expect((await addClient("Replacement")).ok).toBe(true);

    expect(db.clients).toHaveLength(LIMIT + 1);
    expect(await canSync(first)).toBe(false);
    expect(await canCreateReports(first)).toBe(false);
    expect(await workingClients()).toHaveLength(LIMIT);
  });

  it("repeated archive-then-add cycles never grow the set of working clients", async () => {
    await fillToLimit();

    for (let round = 1; round <= 10; round++) {
      const oldestActive = db.clients.find((c) => !c.archived)!;
      expect(await archive(oldestActive.id)).toEqual({ ok: true });
      expect((await addClient(`Round ${round}`)).ok).toBe(true);
      expect(await workingClients()).toHaveLength(LIMIT);
    }

    const archived = db.clients.filter((c) => c.archived);
    expect(archived).toHaveLength(10);
    for (const client of archived) {
      expect(await canSync(client.id)).toBe(false);
      expect(await canCreateReports(client.id)).toBe(false);
      expect(await restore(client.id)).toMatchObject({ ok: false, upgrade: true });
    }
    expect((await checkClientLimit(tenant as never, AGENCY)).current).toBe(LIMIT);
  });

  it("an archived client's sync makes no provider call, records no usage and marks nothing on the source", async () => {
    const [first] = await fillToLimit();
    await archive(first);

    const result = await syncDataSource(tenant as never, sourceFor(first));

    expect(result).toEqual({ ok: false, skipped: true, error: expect.stringContaining("archived") });
    expect(getValidAccessToken).not.toHaveBeenCalled();
    expect(trackUsage).not.toHaveBeenCalled();
    expect(sourceWrites).toEqual([{ id: `ds-${first}`, patch: { last_sync_attempt_at: expect.any(String) } }]);
  });

  it("an archived client can't generate a report, which also covers Send now and scheduled delivery", async () => {
    const [first] = await fillToLimit();
    await archive(first);

    expect(await createClientReport(tenant as never, AGENCY, first)).toEqual({
      ok: false,
      status: 409,
      error: expect.stringContaining("archived"),
    });
  });

  it("the sync cron skips archived clients' sources without counting them as failures", async () => {
    const [first, second] = await fillToLimit();
    await archive(first);

    const result = await processSources(admin as never, [sourceFor(first), sourceFor(second)]);

    // The active client's source still goes through the sync and stops at "no
    // site selected"; the archived one is neither synced nor failed.
    expect(result).toEqual({ synced: 0, failed: 1 });
    expect(sourceWrites.filter((w) => w.id === `ds-${first}`)).toEqual([
      { id: `ds-${first}`, patch: { last_sync_attempt_at: expect.any(String) } },
    ]);
  });
});

describe("restore still enforces the plan limit", () => {
  it("refuses a restore while the plan is full, and allows it once a slot is free", async () => {
    const [first] = await fillToLimit();
    await archive(first);
    const replacement = await addClient("Replacement");
    if (!replacement.ok) throw new Error("the archived client's slot should be free");

    expect(await restore(first)).toMatchObject({ ok: false, upgrade: true });
    expect(db.clients.find((c) => c.id === first)?.archived).toBe(true);
    expect(await canSync(first)).toBe(false);

    await archive(replacement.id);
    expect(await restore(first)).toEqual({ ok: true });
    expect(await canSync(first)).toBe(true);
    expect(await canCreateReports(first)).toBe(true);
    expect(await canSync(replacement.id)).toBe(false);
    expect(await workingClients()).toHaveLength(LIMIT);
  });
});

describe("legitimate client use is unchanged", () => {
  it("clients under the limit work, and an archive-restore round trip brings a client fully back", async () => {
    const a = await addClient("Acme");
    const b = await addClient("Beta");
    if (!a.ok || !b.ok) throw new Error("both clients should be created under the limit");
    expect(await workingClients()).toEqual([a.id, b.id]);

    expect(await archive(a.id)).toEqual({ ok: true });
    expect(await workingClients()).toEqual([b.id]);
    expect((await checkClientLimit(tenant as never, AGENCY)).current).toBe(1);

    expect(await restore(a.id)).toEqual({ ok: true });
    expect(await workingClients()).toEqual([a.id, b.id]);
    expect((await checkClientLimit(tenant as never, AGENCY)).current).toBe(2);
  });

  it("an active client's sync and reports are not blocked by the archive check", async () => {
    const a = await addClient("Acme");
    if (!a.ok) throw new Error("the client should be created");

    expect(await syncDataSource(tenant as never, sourceFor(a.id))).toEqual({ ok: false, error: expect.stringMatching(/selected/) });
    expect(await createClientReport(tenant as never, AGENCY, a.id)).toMatchObject({ ok: false, status: 400 });
  });
});

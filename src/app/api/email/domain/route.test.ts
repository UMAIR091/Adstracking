// The sending-domain routes are the only writers of email_domains. Tenants can
// read and delete their row but not write it (migration 0039), because the
// row's status is what lib/email/sender.ts trusts to send white-label mail.
// These tests pin that the routes write with the service role, that what they
// store comes from Resend and never from the request, and that a domain can't
// be taken from the platform or from another workspace.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

type Op = { client: "tenant" | "admin"; op: string; payload?: unknown; filters: [string, unknown][] };
const ops: Op[] = [];
let ownRow: Record<string, unknown> | null = null;
let takenElsewhere = false;
let insertError: { code?: string; message: string } | null = null;

// One builder for both clients. Only writes are recorded; awaiting a builder
// resolves the way the route expects for that operation.
function fakeClient(kind: "tenant" | "admin") {
  return {
    from: () => {
      const entry: Op = { client: kind, op: "select", filters: [] };
      const write = (op: string) => (payload?: unknown) => {
        entry.op = op;
        entry.payload = payload;
        ops.push(entry);
        return chain;
      };
      const chain = {
        select: () => chain,
        insert: write("insert"),
        update: write("update"),
        upsert: write("upsert"),
        delete: write("delete"),
        eq: (col: string, val: unknown) => {
          entry.filters.push([col, val]);
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => ({ data: kind === "tenant" ? ownRow : null, error: null }),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(
            entry.op === "insert"
              ? { error: insertError }
              : entry.op === "select"
                ? { data: kind === "admin" && takenElsewhere ? [{ id: "other-workspace-row" }] : [], error: null }
                : { error: null }
          ).then(res, rej),
      };
      return chain;
    },
  };
}

const provider = {
  isConfigured: vi.fn(() => true),
  createDomain: vi.fn(),
  getDomain: vi.fn(),
  verifyDomain: vi.fn(),
  deleteDomain: vi.fn(),
};

vi.mock("@/lib/agency", () => ({
  getCurrentUserAndAgency: async () => ({ user: { id: "u1" }, agency: { id: "a1" } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => fakeClient("tenant") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeClient("admin") }));
vi.mock("@/lib/email", async () => ({
  ...((await vi.importActual("@/lib/email")) as Record<string, unknown>),
  emailProvider: () => provider,
}));

let domainRoute: typeof import("./route");
let verifyRoute: typeof import("./verify/route");
beforeAll(async () => {
  domainRoute = await import("./route");
  verifyRoute = await import("./verify/route");
});

const resendDomain = (status: string, id = "rs_new") => ({
  id,
  name: "acme.com",
  status,
  records: [{ record: "DKIM", name: "resend._domainkey", type: "TXT", value: "p=abc" }],
  region: "us-east-1",
});
const register = (body: unknown) =>
  domainRoute.POST(new Request("https://example.com/api/email/domain", { method: "POST", body: JSON.stringify(body) }));
const writesBy = (client: Op["client"]) => ops.filter((o) => o.client === client);

beforeEach(() => {
  vi.clearAllMocks();
  ops.length = 0;
  ownRow = null;
  takenElsewhere = false;
  insertError = null;
  process.env.EMAIL_FROM = "ReportFlow <reports@tryreportflow.com>";
  provider.verifyDomain.mockResolvedValue(undefined);
  provider.deleteDomain.mockResolvedValue(undefined);
});

describe("registering a sending domain", () => {
  it("stores Resend's answer with the service role and ignores verification fields in the request", async () => {
    provider.createDomain.mockResolvedValue(resendDomain("not_started"));

    const res = await register({ domain: "Acme.com", status: "verified", resend_domain_id: "someone-elses-id", agency_id: "a2" });

    expect(res.status).toBe(200);
    expect(provider.createDomain).toHaveBeenCalledWith("acme.com");
    expect(writesBy("tenant")).toHaveLength(0);
    expect(writesBy("admin")).toEqual([
      expect.objectContaining({
        op: "insert",
        payload: expect.objectContaining({ agency_id: "a1", domain: "acme.com", resend_domain_id: "rs_new", status: "not_started" }),
      }),
    ]);
    await expect(res.json()).resolves.toMatchObject({ domain: { domain: "acme.com", status: "not_started" } });
  });

  it.each(["tryreportflow.com", "mail.tryreportflow.com", "reportflow.com"])(
    "refuses the reserved domain %s without calling Resend",
    async (domain) => {
      const res = await register({ domain });

      expect(res.status).toBe(400);
      expect(provider.createDomain).not.toHaveBeenCalled();
      expect(ops).toHaveLength(0);
    }
  );

  it("refuses a domain another workspace already holds, without calling Resend", async () => {
    takenElsewhere = true;

    const res = await register({ domain: "acme.com" });

    expect(res.status).toBe(409);
    expect(provider.createDomain).not.toHaveBeenCalled();
    expect(ops).toHaveLength(0);
  });

  it("keeps the provider domain when it loses a race for the same domain", async () => {
    provider.createDomain.mockResolvedValue(resendDomain("not_started"));
    insertError = { code: "23505", message: "duplicate key value violates unique constraint" };

    const res = await register({ domain: "acme.com" });

    expect(res.status).toBe(409);
    // Resend may have handed back the winner's domain; deleting it would break their sending.
    expect(provider.deleteDomain).not.toHaveBeenCalled();
  });

  it("still rolls back the provider domain on any other insert failure", async () => {
    provider.createDomain.mockResolvedValue(resendDomain("not_started"));
    insertError = { code: "08006", message: "connection failure" };

    const res = await register({ domain: "acme.com" });

    expect(res.status).toBe(502);
    expect(provider.deleteDomain).toHaveBeenCalledWith("rs_new");
  });
});

describe("verification state comes only from Resend, written by the service role", () => {
  beforeEach(() => {
    ownRow = { resend_domain_id: "rs_own", domain: "acme.com", status: "pending", dns_records: [], region: "us-east-1", last_checked_at: null };
  });

  it("stores pending while Resend has not verified the domain", async () => {
    provider.getDomain.mockResolvedValue(resendDomain("pending", "rs_own"));

    const res = await verifyRoute.POST();

    expect(res.status).toBe(200);
    expect(provider.verifyDomain).toHaveBeenCalledWith("rs_own");
    expect(writesBy("tenant")).toHaveLength(0);
    expect(writesBy("admin")).toEqual([
      expect.objectContaining({ op: "update", filters: [["agency_id", "a1"]], payload: expect.objectContaining({ status: "pending" }) }),
    ]);
  });

  it("stores verified only when Resend reports it", async () => {
    provider.getDomain.mockResolvedValue(resendDomain("verified", "rs_own"));

    const res = await verifyRoute.POST();

    await expect(res.json()).resolves.toMatchObject({ domain: { status: "verified" } });
    expect(writesBy("tenant")).toHaveLength(0);
    expect(writesBy("admin")).toEqual([expect.objectContaining({ op: "update", payload: expect.objectContaining({ status: "verified" }) })]);
  });

  it("refreshing the settings page stores Resend's current status with the service role", async () => {
    provider.getDomain.mockResolvedValue(resendDomain("failed", "rs_own"));

    const res = await domainRoute.GET();

    expect(res.status).toBe(200);
    expect(provider.getDomain).toHaveBeenCalledWith("rs_own");
    expect(writesBy("tenant")).toHaveLength(0);
    expect(writesBy("admin")).toEqual([
      expect.objectContaining({ op: "update", filters: [["agency_id", "a1"]], payload: expect.objectContaining({ status: "failed" }) }),
    ]);
  });

  it("removing the domain still runs through the member's own session", async () => {
    const res = await domainRoute.DELETE();

    expect(res.status).toBe(200);
    expect(provider.deleteDomain).toHaveBeenCalledWith("rs_own");
    expect(writesBy("admin")).toHaveLength(0);
    expect(writesBy("tenant")).toEqual([expect.objectContaining({ op: "delete", filters: [["agency_id", "a1"]] })]);
  });
});

// Branding must follow the report, not the viewer.
//
// The regression these lock: the authenticated render paths took branding from
// `getCurrentUserAndAgency()` — the session — while looking the report up by id
// alone. Generating for one client and then viewing another's report rendered
// the second under the first one's brand. Nothing in the loader may consult
// anything but the stored report row.
import { describe, expect, it } from "vitest";
import { loadReportForRender } from "./branding";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Two workspaces, each with its own client and report ───────────────────
const AGENCIES = [
  {
    id: "agency-a",
    name: "Northstar Digital",
    brand_color: "#4e56b0",
    website: "northstar.example",
    footer_text: "Northstar footer",
    contact_email: "hello@northstar.example",
    logo_url: "https://cdn.example/northstar.png",
    email_footer: null,
  },
  {
    id: "agency-b",
    name: "Harbour Marketing",
    brand_color: "#c2410c",
    website: "harbour.example",
    footer_text: "Harbour footer",
    contact_email: "hi@harbour.example",
    logo_url: "https://cdn.example/harbour.png",
    email_footer: null,
  },
];

const CLIENTS = [
  { id: "client-a", name: "Acme Running Co.", email: "a@acme.example", logo_url: "https://cdn.example/acme.png" },
  { id: "client-b", name: "Bluefin Coffee", email: "b@bluefin.example", logo_url: "https://cdn.example/bluefin.png" },
];

const REPORTS = [
  {
    id: "report-a", agency_id: "agency-a", client_id: "client-a", title: "Acme — July",
    period_start: "2026-07-01", period_end: "2026-07-31", data: { gsc: null },
    share_token: "tok-a", pdf_cached_hash: null,
  },
  {
    id: "report-b", agency_id: "agency-b", client_id: "client-b", title: "Bluefin — July",
    period_start: "2026-07-01", period_end: "2026-07-31", data: { ga4: null },
    share_token: "tok-b", pdf_cached_hash: null,
  },
];

/**
 * A Supabase stand-in over those rows.
 *
 * It records every filter it is asked for, so a test can assert not only what
 * came back but that the query was scoped — an unfiltered read is the defect
 * being guarded against, and it would still return plausible data.
 */
function fakeDb() {
  const queries: { table: string; filters: Record<string, unknown> }[] = [];

  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return q;
      },
      maybeSingle: async () => {
        queries.push({ table, filters });
        if (table === "reports") {
          const row = REPORTS.find(
            (r) =>
              (filters.id === undefined || r.id === filters.id) &&
              (filters.share_token === undefined || r.share_token === filters.share_token) &&
              (filters.agency_id === undefined || r.agency_id === filters.agency_id),
          );
          if (!row) return { data: null };
          const client = CLIENTS.find((c) => c.id === row.client_id) ?? null;
          return { data: { ...row, clients: client } };
        }
        if (table === "agencies") {
          return { data: AGENCIES.find((a) => a.id === filters.id) ?? null };
        }
        return { data: null };
      },
    };
    return q;
  };

  return { db: { from } as unknown as SupabaseClient, queries };
}

describe("loadReportForRender", () => {
  it("takes branding from the agency the report belongs to", async () => {
    const { db } = fakeDb();
    const a = await loadReportForRender(db, { id: "report-a" });
    expect(a!.branding.name).toBe("Northstar Digital");
    expect(a!.branding.brand_color).toBe("#4e56b0");
    expect(a!.branding.logo_url).toBe("https://cdn.example/northstar.png");
    expect(a!.clientName).toBe("Acme Running Co.");
    expect(a!.clientLogoUrl).toBe("https://cdn.example/acme.png");
  });

  // The exact sequence from the bug report. Each call must be independent of
  // every call before it.
  it("keeps A → B → A → B correct in both directions", async () => {
    const { db } = fakeDb();
    const seen: string[] = [];
    for (const id of ["report-a", "report-b", "report-a", "report-b"]) {
      const r = await loadReportForRender(db, { id });
      seen.push(`${r!.branding.name} / ${r!.clientName} / ${r!.branding.brand_color}`);
    }
    expect(seen).toEqual([
      "Northstar Digital / Acme Running Co. / #4e56b0",
      "Harbour Marketing / Bluefin Coffee / #c2410c",
      "Northstar Digital / Acme Running Co. / #4e56b0",
      "Harbour Marketing / Bluefin Coffee / #c2410c",
    ]);
  });

  it("resolves the agency by the report's own agency_id, not by anything else", async () => {
    const { db, queries } = fakeDb();
    await loadReportForRender(db, { id: "report-b" });
    const agencyQuery = queries.find((q) => q.table === "agencies");
    expect(agencyQuery).toBeDefined();
    expect(agencyQuery!.filters.id).toBe("agency-b");
  });

  it("scopes the report read to the caller's agency when one is given", async () => {
    const { db, queries } = fakeDb();
    const ok = await loadReportForRender(db, { id: "report-a" }, "agency-a");
    expect(ok).not.toBeNull();
    expect(queries[0].filters.agency_id).toBe("agency-a");
  });

  it("refuses a report belonging to another workspace", async () => {
    const { db } = fakeDb();
    // Someone signed into agency A asking for agency B's report gets nothing —
    // not agency A's branding wrapped around agency B's figures.
    expect(await loadReportForRender(db, { id: "report-b" }, "agency-a")).toBeNull();
  });

  it("serves the public share route from the same rules", async () => {
    const { db } = fakeDb();
    const a = await loadReportForRender(db, { shareToken: "tok-a" });
    const b = await loadReportForRender(db, { shareToken: "tok-b" });
    expect(a!.branding.name).toBe("Northstar Digital");
    expect(b!.branding.name).toBe("Harbour Marketing");
    expect(a!.clientName).toBe("Acme Running Co.");
    expect(b!.clientName).toBe("Bluefin Coffee");
  });

  it("never carries a value over from the previous call", async () => {
    const { db } = fakeDb();
    const first = await loadReportForRender(db, { id: "report-a" });
    const second = await loadReportForRender(db, { id: "report-b" });
    // Every branding field differs between the two workspaces, so any leakage
    // shows up as an equal field rather than needing a specific assertion.
    for (const key of ["name", "brand_color", "website", "footer_text", "contact_email", "logo_url"] as const) {
      expect(second!.branding[key]).not.toBe(first!.branding[key]);
    }
    expect(second!.clientName).not.toBe(first!.clientName);
    expect(second!.clientLogoUrl).not.toBe(first!.clientLogoUrl);
  });

  it("returns nothing for a report that does not exist", async () => {
    const { db } = fakeDb();
    const missing = await loadReportForRender(db, { id: "no-such-report" });
    expect(missing).toBeNull();
  });

  it("reads nothing but reports and agencies", async () => {
    const { db, queries } = fakeDb();
    await loadReportForRender(db, { id: "report-a" });
    expect(new Set(queries.map((q) => q.table))).toEqual(new Set(["reports", "agencies"]));
  });
});

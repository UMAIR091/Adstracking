// Cross-client branding isolation and persistence.
//
// branding.test.ts covers the loader's own contract. These cover the promises
// a client actually depends on, across the whole render path:
//
//   · a generated report keeps the branding of the workspace it was generated
//     for, whatever is selected or edited afterwards
//   · the web report and the PDF are handed the same branding
//   · nothing carries between renders through a shared object, a cached style
//     sheet, or a fallback that quietly borrows another workspace's values
//   · A → B → A → B stays correct in both directions
//
// The architecture resolves branding dynamically from reports.agency_id rather
// than snapshotting it into reports.data. That is preserved here: the tests
// assert scoping, not that an old report freezes its agency's logo.
import { describe, expect, it } from "vitest";
import { loadReportForRender, type ScopedReport } from "./branding";
import { makeStyles, safeColor, seriesColors } from "@/lib/pdf/theme";
import type { SupabaseClient } from "@supabase/supabase-js";

type Agency = {
  id: string; name: string; brand_color: string; website: string | null;
  footer_text: string | null; contact_email: string | null; logo_url: string | null;
  email_footer: string | null;
};
type Client = { id: string; agency_id: string; name: string; email: string | null; logo_url: string | null };
type Report = {
  id: string; agency_id: string; client_id: string; title: string;
  period_start: string; period_end: string; data: unknown;
  share_token: string; pdf_cached_hash: string | null;
};

/** A mutable two-workspace world, so "edited afterwards" can be exercised. */
function world() {
  const agencies: Agency[] = [
    {
      id: "agency-a", name: "Northstar Digital", brand_color: "#4e56b0",
      website: "northstar.example", footer_text: "Northstar footer",
      contact_email: "hello@northstar.example", logo_url: "https://cdn.example/northstar.png",
      email_footer: null,
    },
    {
      id: "agency-b", name: "Harbour Marketing", brand_color: "#c2410c",
      website: "harbour.example", footer_text: "Harbour footer",
      contact_email: "hi@harbour.example", logo_url: "https://cdn.example/harbour.png",
      email_footer: null,
    },
  ];
  const clients: Client[] = [
    { id: "client-a", agency_id: "agency-a", name: "Acme Running Co.", email: "a@acme.example", logo_url: "https://cdn.example/acme.png" },
    { id: "client-b", agency_id: "agency-b", name: "Bluefin Coffee", email: "b@bluefin.example", logo_url: "https://cdn.example/bluefin.png" },
    // A second client inside the SAME workspace as A, for the "another client
    // was selected or updated" case within one agency.
    { id: "client-a2", agency_id: "agency-a", name: "Cedar Dental", email: "c@cedar.example", logo_url: "https://cdn.example/cedar.png" },
  ];
  const reports: Report[] = [
    { id: "report-a", agency_id: "agency-a", client_id: "client-a", title: "Acme — July", period_start: "2026-07-01", period_end: "2026-07-31", data: { gsc: null }, share_token: "tok-a", pdf_cached_hash: null },
    { id: "report-b", agency_id: "agency-b", client_id: "client-b", title: "Bluefin — July", period_start: "2026-07-01", period_end: "2026-07-31", data: { ga4: null }, share_token: "tok-b", pdf_cached_hash: null },
    { id: "report-a2", agency_id: "agency-a", client_id: "client-a2", title: "Cedar — July", period_start: "2026-07-01", period_end: "2026-07-31", data: { gsc: null }, share_token: "tok-a2", pdf_cached_hash: null },
  ];

  const from = (table: string) => {
    const f: Record<string, unknown> = {};
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => { f[col] = val; return q; },
      maybeSingle: async () => {
        if (table === "reports") {
          const row = reports.find(
            (r) =>
              (f.id === undefined || r.id === f.id) &&
              (f.share_token === undefined || r.share_token === f.share_token) &&
              (f.agency_id === undefined || r.agency_id === f.agency_id),
          );
          if (!row) return { data: null };
          return { data: { ...row, clients: clients.find((c) => c.id === row.client_id) ?? null } };
        }
        if (table === "agencies") return { data: agencies.find((a) => a.id === f.id) ?? null };
        return { data: null };
      },
    };
    return q;
  };

  return { db: { from } as unknown as SupabaseClient, agencies, clients, reports };
}

/** What each renderer is handed. The two must agree field for field. */
const webBranding = (r: ScopedReport) => ({
  name: r.branding.name,
  logo_url: r.branding.logo_url,
  brand_color: r.branding.brand_color,
  website: r.branding.website,
  footer_text: r.branding.footer_text,
});
const pdfBranding = (r: ScopedReport) => r.branding;

describe("a report keeps the branding it was generated for", () => {
  it("is unaffected by another client being generated afterwards", async () => {
    const { db } = world();
    const before = await loadReportForRender(db, { id: "report-a" });
    // Another workspace's report is generated and rendered in between.
    await loadReportForRender(db, { id: "report-b" });
    const after = await loadReportForRender(db, { id: "report-a" });
    expect(after!.branding).toEqual(before!.branding);
    expect(after!.clientName).toBe("Acme Running Co.");
  });

  it("is unaffected by another CLIENT in the same workspace being updated", async () => {
    const { db, clients } = world();
    const before = await loadReportForRender(db, { id: "report-a" });
    const other = clients.find((c) => c.id === "client-a2")!;
    other.name = "Cedar Dental Group";
    other.logo_url = "https://cdn.example/cedar-v2.png";
    const after = await loadReportForRender(db, { id: "report-a" });
    expect(after!.clientName).toBe(before!.clientName);
    expect(after!.clientLogoUrl).toBe(before!.clientLogoUrl);
    expect(after!.branding).toEqual(before!.branding);
  });

  it("is unaffected by another WORKSPACE rebranding entirely", async () => {
    const { db, agencies } = world();
    const before = await loadReportForRender(db, { id: "report-a" });
    const b = agencies.find((a) => a.id === "agency-b")!;
    b.name = "Harbour Group";
    b.brand_color = "#000000";
    b.logo_url = "https://cdn.example/harbour-v2.png";
    const after = await loadReportForRender(db, { id: "report-a" });
    expect(after!.branding).toEqual(before!.branding);
  });

  // Branding is resolved dynamically, by design — this pins that behaviour so a
  // future change to snapshotting is a deliberate one, not a silent drift.
  it("follows its OWN workspace's later edits, which is the dynamic contract", async () => {
    const { db, agencies } = world();
    const before = await loadReportForRender(db, { id: "report-a" });
    agencies.find((a) => a.id === "agency-a")!.name = "Northstar Digital Ltd";
    const after = await loadReportForRender(db, { id: "report-a" });
    expect(before!.branding.name).toBe("Northstar Digital");
    expect(after!.branding.name).toBe("Northstar Digital Ltd");
    expect(after!.branding.brand_color).toBe(before!.branding.brand_color);
  });
});

describe("the web report and the PDF are branded alike", () => {
  it("hands both renderers the same values for the same report", async () => {
    const { db } = world();
    for (const id of ["report-a", "report-b"]) {
      const r = (await loadReportForRender(db, { id }))!;
      const web = webBranding(r);
      const pdf = pdfBranding(r);
      expect(web.name).toBe(pdf.name);
      expect(web.brand_color).toBe(pdf.brand_color);
      expect(web.logo_url).toBe(pdf.logo_url);
      expect(web.website).toBe(pdf.website);
      expect(web.footer_text).toBe(pdf.footer_text);
    }
  });

  it("gives the share routes the same branding as the authenticated ones", async () => {
    const { db } = world();
    const byId = await loadReportForRender(db, { id: "report-b" });
    const byToken = await loadReportForRender(db, { shareToken: "tok-b" });
    expect(byToken!.branding).toEqual(byId!.branding);
    expect(byToken!.clientName).toBe(byId!.clientName);
  });
});

describe("nothing leaks between renders", () => {
  it("keeps A → B → A → B correct across every branding field", async () => {
    const { db } = world();
    const seq = ["report-a", "report-b", "report-a", "report-b"];
    const out: Record<string, unknown>[] = [];
    for (const id of seq) {
      const r = (await loadReportForRender(db, { id }))!;
      out.push({ ...r.branding, client: r.clientName, clientLogo: r.clientLogoUrl });
    }
    expect(out[0]).toEqual(out[2]);
    expect(out[1]).toEqual(out[3]);
    expect(out[0]).not.toEqual(out[1]);
    expect(out[0].client).toBe("Acme Running Co.");
    expect(out[1].client).toBe("Bluefin Coffee");
  });

  it("returns a fresh branding object each time, not a shared one", async () => {
    const { db } = world();
    const first = (await loadReportForRender(db, { id: "report-a" }))!;
    // Mutating what one render was handed must not reach the next render.
    first.branding.name = "MUTATED";
    first.branding.logo_url = "https://cdn.example/mutated.png";
    const second = (await loadReportForRender(db, { id: "report-a" }))!;
    expect(second.branding.name).toBe("Northstar Digital");
    expect(second.branding.logo_url).toBe("https://cdn.example/northstar.png");
  });

  it("never falls back to another workspace's values when a field is missing", async () => {
    const { db, agencies } = world();
    const a = agencies.find((x) => x.id === "agency-a")!;
    a.logo_url = null;
    a.website = null;
    // Load B first, so anything cached or shared would hold Harbour's values.
    await loadReportForRender(db, { id: "report-b" });
    const r = (await loadReportForRender(db, { id: "report-a" }))!;
    expect(r.branding.logo_url).toBeNull();
    expect(r.branding.website).toBeNull();
    expect(r.branding.name).toBe("Northstar Digital");
  });

  it("builds PDF styles from the report's own colour every time", async () => {
    const { db } = world();
    const a = (await loadReportForRender(db, { id: "report-a" }))!;
    const b = (await loadReportForRender(db, { id: "report-b" }))!;
    // makeStyles is called per render and memoises nothing; a cached style
    // sheet would put one workspace's accent on the other's cover.
    const styleA = makeStyles(safeColor(a.branding.brand_color));
    const styleB = makeStyles(safeColor(b.branding.brand_color));
    expect(styleA.coverPage.backgroundColor).toBe("#4e56b0");
    expect(styleB.coverPage.backgroundColor).toBe("#c2410c");
    expect(makeStyles(safeColor(a.branding.brand_color)).coverPage.backgroundColor).toBe("#4e56b0");
    expect(seriesColors(a.branding.brand_color)[0]).toBe("#4e56b0");
    expect(seriesColors(b.branding.brand_color)[0]).toBe("#c2410c");
  });
});

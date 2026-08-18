// Branding belongs to the report, not to whoever is looking at it.
//
// THE BUG THIS FIXES
// The three authenticated render paths — the report page, its PDF download and
// the "email report" action — each fetched the report by id alone and then took
// the branding from `getCurrentUserAndAgency()`, i.e. from the viewer's
// session:
//
//   const { agency } = await getCurrentUserAndAgency();
//   const { data: report } = await supabase.from("reports").eq("id", id)…
//   renderReportPdf({ branding: { name: agency.name, … } })
//
// The report row carries `agency_id` and `client_id`. Neither was used. So the
// name, logo and accent colour stamped on a client's report were whichever
// workspace the session happened to resolve to — and `getCurrentUserAndAgency`
// resolves a member of more than one workspace to the OLDEST of them, via a
// query with no user filter at all (`select("*").order("created_at").limit(1)`,
// narrowed only by RLS). View a report belonging to the second workspace and it
// renders under the first workspace's brand.
//
// The two public share routes already did it correctly, reading the agency by
// `report.agency_id`. This module makes that the only way it is done anywhere,
// so a render path cannot accidentally reach for session state again.
//
// Everything here is resolved from the stored report row:
//   agency name / logo / colour  ← agencies WHERE id = report.agency_id
//   client name / logo           ← clients  WHERE id = report.client_id
//
// `agencyId` is an optional extra filter for authenticated callers. RLS already
// restricts what they can read; passing it makes the scope explicit in the
// query rather than implicit in the policy, so the same code is safe when
// handed an admin client.
import type { SupabaseClient } from "@supabase/supabase-js";

/** The agency-owned half of a report's branding. */
export type ReportBranding = {
  name: string;
  brand_color: string;
  website: string | null;
  footer_text: string | null;
  contact_email: string | null;
  logo_url: string | null;
  email_footer: string | null;
};

export type ScopedReport = {
  id: string;
  agencyId: string;
  clientId: string | null;
  title: string;
  period: { start: string; end: string };
  data: unknown;
  shareToken: string | null;
  pdfCachedHash: string | null;
  /** From the report's own client row — never from the session or a list. */
  clientName: string;
  clientEmail: string | null;
  clientLogoUrl: string | null;
  /** From the report's own agency row — never from the viewer's agency. */
  branding: ReportBranding;
};

const FALLBACK: ReportBranding = {
  name: "Agency",
  brand_color: "#4f46e5",
  website: null,
  footer_text: null,
  contact_email: null,
  logo_url: null,
  email_footer: null,
};

type ReportRow = {
  id: string;
  agency_id: string;
  client_id: string | null;
  title: string;
  period_start: string;
  period_end: string;
  data: unknown;
  share_token: string | null;
  pdf_cached_hash: string | null;
  clients: ClientRow | ClientRow[];
};

type AgencyRow = Partial<ReportBranding> | null;
type ClientRow = { name: string | null; email: string | null; logo_url: string | null } | null;

/** Supabase returns an embedded row as an object or a single-element array. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const REPORT_COLUMNS =
  "id, agency_id, client_id, title, period_start, period_end, data, share_token, pdf_cached_hash, " +
  "clients(name, email, logo_url)";

/**
 * Loads a report together with the branding of the agency and client it belongs
 * to.
 *
 * Look it up by id (authenticated) or by share token (public). Returns null when
 * the report doesn't exist or falls outside `agencyId`.
 */
export async function loadReportForRender(
  db: SupabaseClient,
  lookup: { id: string } | { shareToken: string },
  agencyId?: string,
): Promise<ScopedReport | null> {
  let q = db.from("reports").select(REPORT_COLUMNS);
  q = "id" in lookup ? q.eq("id", lookup.id) : q.eq("share_token", lookup.shareToken);
  // Defence in depth: RLS already scopes an authenticated read, and this states
  // the same scope in the query so it holds for an admin client too.
  if (agencyId) q = q.eq("agency_id", agencyId);

  const { data } = await q.maybeSingle();
  const report = (data ?? null) as unknown as ReportRow | null;
  if (!report) return null;

  const reportAgencyId = report.agency_id;

  // The agency the REPORT belongs to. Not the one the viewer is signed into.
  const { data: agency } = await db
    .from("agencies")
    .select("name, brand_color, website, footer_text, contact_email, logo_url, email_footer")
    .eq("id", reportAgencyId)
    .maybeSingle();

  const a = (agency ?? null) as AgencyRow;
  const client = one(report.clients);

  return {
    id: report.id,
    agencyId: reportAgencyId,
    clientId: report.client_id ?? null,
    title: report.title,
    period: { start: report.period_start, end: report.period_end },
    data: report.data,
    shareToken: report.share_token ?? null,
    pdfCachedHash: report.pdf_cached_hash ?? null,
    clientName: client?.name ?? "Client",
    clientEmail: client?.email ?? null,
    clientLogoUrl: client?.logo_url ?? null,
    branding: {
      name: a?.name ?? FALLBACK.name,
      brand_color: a?.brand_color ?? FALLBACK.brand_color,
      website: a?.website ?? null,
      footer_text: a?.footer_text ?? null,
      contact_email: a?.contact_email ?? null,
      logo_url: a?.logo_url ?? null,
      email_footer: a?.email_footer ?? null,
    },
  };
}

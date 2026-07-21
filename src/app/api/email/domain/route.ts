import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { emailProvider, domainOfEmail, type SendingDomain } from "@/lib/email";

export const runtime = "nodejs";

// White-label sending domain for the signed-in agency.
//   GET     current domain + fresh verification state from the provider
//   POST    { domain } — register a new sending domain
//   DELETE  remove the domain (provider + our record)
//
// One domain per agency (unique constraint). All reads/writes go through the
// RLS client, so an agency can only ever touch its own row.

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!d || d.length > 253 || !HOSTNAME_RE.test(d)) return null;
  return d;
}

// The platform's own sending domain (and its subdomains) can never be claimed
// by a tenant — that would let one agency send as the platform or as others.
function isReservedDomain(domain: string): boolean {
  const platform = domainOfEmail((process.env.EMAIL_FROM ?? "").match(/<([^>]+)>/)?.[1] ?? process.env.EMAIL_FROM ?? "");
  const reserved = [platform, "reportflow.com", "tryreportflow.com"].filter(Boolean) as string[];
  return reserved.some((r) => domain === r || domain.endsWith(`.${r}`));
}

type DomainView = {
  domain: string;
  status: string;
  records: SendingDomain["records"];
  region?: string | null;
  lastCheckedAt: string | null;
};

function view(row: { domain: string; status: string; dns_records: unknown; region: string | null; last_checked_at: string | null }): DomainView {
  return {
    domain: row.domain,
    status: row.status,
    records: (row.dns_records as SendingDomain["records"]) ?? [],
    region: row.region,
    lastCheckedAt: row.last_checked_at,
  };
}

export async function GET() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const { data: row } = await supabase
    .from("email_domains")
    .select("resend_domain_id, domain, status, dns_records, region, last_checked_at")
    .eq("agency_id", agency.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ domain: null });

  // Refresh from the provider so the page always shows live status; keep the
  // cached copy when the provider is briefly unreachable.
  try {
    const fresh = await emailProvider().getDomain(row.resend_domain_id);
    const patch = {
      status: fresh.status,
      dns_records: fresh.records,
      region: fresh.region ?? row.region,
      last_checked_at: new Date().toISOString(),
    };
    await supabase.from("email_domains").update(patch).eq("agency_id", agency.id);
    return NextResponse.json({ domain: view({ ...row, ...patch }) });
  } catch {
    return NextResponse.json({ domain: view(row), stale: true });
  }
}

export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailProvider().isConfigured()) {
    return NextResponse.json({ error: "Email isn't configured on the platform yet." }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { domain?: string } | null;
  const domain = body?.domain ? normalizeDomain(body.domain) : null;
  if (!domain) return NextResponse.json({ error: "Enter a valid domain, e.g. agency.com" }, { status: 400 });
  if (isReservedDomain(domain)) return NextResponse.json({ error: "That domain can't be used." }, { status: 400 });

  const supabase = createClient();
  const { data: existing } = await supabase.from("email_domains").select("id").eq("agency_id", agency.id).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "A sending domain is already configured. Remove it first to change domains." }, { status: 409 });
  }

  try {
    const created = await emailProvider().createDomain(domain);
    const rowData = {
      agency_id: agency.id,
      domain,
      resend_domain_id: created.id,
      status: created.status,
      dns_records: created.records,
      region: created.region ?? null,
      last_checked_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("email_domains").insert(rowData);
    if (error) {
      // Roll back the provider-side domain so a DB failure doesn't leak one.
      await emailProvider().deleteDomain(created.id).catch(() => undefined);
      throw new Error(error.message);
    }
    return NextResponse.json({ domain: view({ ...rowData, last_checked_at: rowData.last_checked_at }) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function DELETE() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const { data: row } = await supabase
    .from("email_domains")
    .select("resend_domain_id")
    .eq("agency_id", agency.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: true });

  // Provider first (best-effort — an orphaned provider domain is harmless and
  // retryable; a dangling DB row pointing nowhere is confusing).
  await emailProvider().deleteDomain(row.resend_domain_id).catch((err) =>
    console.warn(`Resend domain delete failed (continuing): ${(err as Error).message}`)
  );
  const { error } = await supabase.from("email_domains").delete().eq("agency_id", agency.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 20;
const MAX = 50;

// Server-side reports pagination + filtering (perf audit P1). Replaces loading
// every report into the browser: returns only the current page, filtered in the
// database (indexed by reports_agency_created_idx / reports_client_created_idx).
// RLS scopes every row to the caller's agency.
export async function GET(req: Request) {
  const { user } = await getCurrentUserAndAgency();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const clientId = url.searchParams.get("clientId") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.min(MAX, Math.max(1, Number(url.searchParams.get("limit")) || PAGE));

  const supabase = createClient();
  let query = supabase
    .from("reports")
    .select("id, title, status, period_start, period_end, created_at, share_token, clients(name)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit); // fetch one extra to detect hasMore

  if (q) query = query.ilike("title", `%${q}%`);
  if (clientId) query = query.eq("client_id", clientId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Couldn't load reports." }, { status: 500 });

  const all = data ?? [];
  const hasMore = all.length > limit;
  const rows = all.slice(0, limit).map((r) => {
    const c = r.clients as unknown as { name: string | null } | { name: string | null }[] | null;
    return {
      id: r.id as string,
      title: r.title as string,
      status: r.status as string,
      period_start: (r.period_start as string | null) ?? null,
      period_end: (r.period_end as string | null) ?? null,
      created_at: r.created_at as string,
      share_token: (r.share_token as string | null) ?? null,
      clientName: (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Client",
    };
  });

  return NextResponse.json({ rows, hasMore }, { headers: { "Cache-Control": "no-store" } });
}

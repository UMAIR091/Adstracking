import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 20;
const MAX = 50;

// Sort options exposed to the UI. Kept as a whitelist mapping to real columns
// so a query param can never reach .order() as free text.
const SORTS = {
  newest: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  title: { column: "title", ascending: true },
  period: { column: "period_end", ascending: false },
} as const;
export type SortKey = keyof typeof SORTS;

// Server-side reports pagination + filtering (perf audit P1). Returns only the
// current page, filtered in the database (indexed by reports_agency_created_idx
// / reports_client_created_idx). RLS scopes every row to the caller's agency.
export async function GET(req: Request) {
  const { user } = await getCurrentUserAndAgency();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const clientId = url.searchParams.get("clientId") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const sortKey = (url.searchParams.get("sort") ?? "newest") as SortKey;
  const sort = SORTS[sortKey] ?? SORTS.newest;
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.min(MAX, Math.max(1, Number(url.searchParams.get("limit")) || PAGE));

  const supabase = createClient();
  let query = supabase
    .from("reports")
    .select("id, title, status, period_start, period_end, created_at, share_token, client_id, meta:data->meta, clients(name)")
    .order(sort.column, { ascending: sort.ascending })
    .range(offset, offset + limit); // fetch one extra to detect hasMore

  if (q) {
    // Search titles AND client names. Client names live on another table, so
    // matching ids are resolved first and OR'd in — otherwise searching for a
    // client would return nothing unless it happened to be in the title, which
    // is the first thing people try.
    const { data: matchingClients } = await supabase
      .from("clients")
      .select("id")
      .ilike("name", `%${q}%`)
      .limit(50);

    const ids = (matchingClients ?? []).map((c) => c.id as string);
    // PostgREST `or` takes a comma-separated filter list; commas inside the
    // search term would split it, so they are stripped rather than escaped.
    const safe = q.replace(/[,()]/g, " ").trim();
    query = ids.length
      ? query.or(`title.ilike.%${safe}%,client_id.in.(${ids.join(",")})`)
      : query.ilike("title", `%${safe}%`);
  }
  if (clientId) query = query.eq("client_id", clientId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Couldn't load reports." }, { status: 500 });

  const all = data ?? [];
  const hasMore = all.length > limit;
  const page = all.slice(0, limit);

  // Delivery counts for just this page — one extra bounded query rather than a
  // per-row lookup, so the "sent 3×" indicator costs the same at 20 rows as at
  // 20,000 reports.
  const ids = page.map((r) => r.id as string);
  const deliveries = new Map<string, { sent: number; failed: number }>();
  if (ids.length) {
    const { data: logs } = await supabase.from("email_logs").select("report_id, status").in("report_id", ids);
    for (const l of logs ?? []) {
      const key = l.report_id as string;
      const entry = deliveries.get(key) ?? { sent: 0, failed: 0 };
      if (l.status === "failed" || l.status === "bounced") entry.failed++;
      else if (l.status !== "pending") entry.sent++;
      deliveries.set(key, entry);
    }
  }

  const rows = page.map((r) => {
    const c = r.clients as unknown as { name: string | null } | { name: string | null }[] | null;
    const d = deliveries.get(r.id as string);
    return {
      id: r.id as string,
      title: r.title as string,
      status: r.status as string,
      period_start: (r.period_start as string | null) ?? null,
      period_end: (r.period_end as string | null) ?? null,
      created_at: r.created_at as string,
      share_token: (r.share_token as string | null) ?? null,
      clientName: (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Client",
      // Same jsonb projection as the first page, so rows fetched by filter or
      // "Load more" carry the type and sources too rather than losing them.
      reportType: (r.meta as { reportType?: string } | null)?.reportType ?? null,
      sourceIds: (r.meta as { sourceIds?: string[] } | null)?.sourceIds ?? null,
      sentCount: d?.sent ?? 0,
      failedCount: d?.failed ?? 0,
    };
  });

  return NextResponse.json({ rows, hasMore }, { headers: { "Cache-Control": "no-store" } });
}

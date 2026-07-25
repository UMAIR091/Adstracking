"use client";

// Reports management (perf audit P1/P2 + UX): SERVER-side search, client + status
// filters, and offset pagination via /api/reports/list — only the visible page
// is ever loaded, so the page stays fast at hundreds of thousands of reports.
// Inline actions (View / Share / Download / Delete) and the reporting period keep
// common tasks one click away.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileBarChart2, Search, MoreHorizontal, Eye, Share2, Download, Trash2, Filter, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useDismissable } from "@/lib/useDismissable";

export type ReportRow = {
  id: string;
  title: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  share_token: string | null;
  clientName: string;
};

export type ClientOption = { id: string; name: string };

const PAGE = 20;

const statusVariant = (s: string) =>
  s === "ready" ? "success" : s === "failed" ? "muted" : s === "generating" ? "warning" : "muted";

export function ReportsBrowser({
  initialRows,
  initialHasMore,
  clients,
  hasAny,
}: {
  initialRows: ReportRow[];
  initialHasMore: boolean;
  clients: ClientOption[];
  hasAny: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const confirm = useConfirm();

  const [rows, setRows] = useState<ReportRow[]>(initialRows);
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Skip the fetch on the very first render (server already provided page 0).
  const firstRender = useRef(true);

  const fetchPage = useCallback(
    async (offset: number): Promise<{ rows: ReportRow[]; hasMore: boolean } | null> => {
      const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
      if (query.trim()) params.set("q", query.trim());
      if (clientId) params.set("clientId", clientId);
      if (status) params.set("status", status);
      const res = await fetch(`/api/reports/list?${params}`, { cache: "no-store" });
      if (!res.ok) return null;
      return res.json();
    },
    [query, clientId, status]
  );

  // Re-query page 0 whenever a filter changes (debounced for the search box).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const data = await fetchPage(0);
      if (cancelled) return;
      if (data) { setRows(data.rows); setHasMore(data.hasMore); }
      setLoading(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [fetchPage]);

  async function loadMore() {
    setLoadingMore(true);
    const data = await fetchPage(rows.length);
    if (data) { setRows((r) => [...r, ...data.rows]); setHasMore(data.hasMore); }
    setLoadingMore(false);
  }

  async function remove(id: string, title: string) {
    if (!(await confirm({
      title: "Delete report?",
      description: `“${title}” will be permanently deleted, including its share link. This can’t be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    }))) return;
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id)); // optimistic
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) {
      setRows(prev);
      toast.error("Couldn't delete the report. Please try again.");
    } else {
      toast.success("Report deleted");
      router.refresh();
    }
  }

  if (!hasAny) {
    return (
      <EmptyState
        icon={FileBarChart2}
        title="No reports yet"
        description="Open a client with Search Console connected and generate your first report — or preview what one looks like."
        action={<Button asChild><Link href="/dashboard/clients">Go to clients</Link></Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input placeholder="Search reports…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" aria-label="Search reports" />
          {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-400" />}
        </div>
        <div className="flex items-center gap-2">
          <Filter size={15} className="hidden text-ink-400 sm:block" />
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Filter by client" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
            <option value="">All statuses</option>
            <option value="ready">Ready</option>
            <option value="generating">Generating</option>
            <option value="draft">Draft</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Results */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-ink-500">
          No reports match your filters.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {rows.map((r) => <ReportItem key={r.id} r={r} onDelete={() => remove(r.id, r.title)} />)}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <><Loader2 size={14} className="animate-spin" /> Loading…</> : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReportItem({ r, onDelete }: { r: ReportRow; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const menuRef = useDismissable<HTMLDivElement>(menu, () => setMenu(false));
  const canShare = r.status === "ready" && !!r.share_token;

  const period =
    r.period_start && r.period_end
      ? `${format(new Date(r.period_start), "MMM d")} – ${format(new Date(r.period_end), "MMM d, yyyy")}`
      : null;

  function share() {
    const url = `${window.location.origin}/r/${r.share_token}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Share link copied to clipboard"),
      () => toast.error("Couldn't copy the link")
    );
    setMenu(false);
  }

  return (
    <Card className="transition-all hover:border-ink-200 hover:shadow-sm">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <Link href={`/dashboard/reports/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <FileBarChart2 size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{r.title}</p>
            <p className="truncate text-xs text-ink-500">
              {r.clientName}
              {period ? <> · <span className="text-ink-500">{period}</span></> : null}
              {" · "}{format(new Date(r.created_at), "MMM d, yyyy")}
            </p>
          </div>
        </Link>

        <div className="flex flex-shrink-0 items-center gap-2">
          <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link href={`/dashboard/reports/${r.id}`}><Eye size={15} /> View</Link>
          </Button>

          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenu((o) => !o)} aria-label="Report actions" aria-haspopup="menu" aria-expanded={menu} className="rounded-lg p-2 text-ink-500 hover:bg-slate-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <Link role="menuitem" href={`/dashboard/reports/${r.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-slate-50" onClick={() => setMenu(false)}>
                  <Eye size={15} /> View report
                </Link>
                {canShare && (
                  <>
                    <button role="menuitem" onClick={share} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-slate-50">
                      <Share2 size={15} /> Copy share link
                    </button>
                    <a role="menuitem" href={`/r/${r.share_token}/pdf`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-slate-50" onClick={() => setMenu(false)}>
                      <Download size={15} /> Download PDF
                    </a>
                  </>
                )}
                <button role="menuitem" onClick={() => { setMenu(false); onDelete(); }} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

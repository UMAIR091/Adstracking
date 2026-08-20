"use client";

// Reports management. SERVER-side search, filtering, sorting and offset
// pagination via /api/reports/list — only the visible page is ever loaded, so
// the screen stays fast at hundreds of thousands of reports.
//
// Two deliberate interaction choices:
//   * Filtering keeps the previous results on screen, dimmed, instead of
//     blanking to a spinner. The list stops "flashing" on every keystroke.
//   * Rows are grouped by month, because reports are inherently periodic and
//     "when was this from?" is the question people scan for.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, isSameMonth, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import {
  FileBarChart2, Search, MoreHorizontal, Eye, Share2, Download, Trash2, Loader2,
  X, ArrowUpDown, Sparkles, Send, CheckCircle2, AlertCircle, Clock, Inbox,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { periodLabel } from "@/lib/report";
import { reportTypeLabel, sourceNames } from "@/lib/reports/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  /** Report kind and contributing sources, from data.meta. Null on older rows. */
  reportType?: string | null;
  sourceIds?: string[] | null;
  sentCount?: number;
  failedCount?: number;
};

export type ClientOption = { id: string; name: string };

const PAGE = 20;

const SORTS = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "period", label: "Reporting period" },
  { key: "title", label: "Title A–Z" },
] as const;

// Status is shown as a dot plus a word: colour alone fails for the ~8% of men
// with a colour-vision deficiency, and "ready" vs "failed" is exactly the
// distinction that must never depend on hue.
const STATUS: Record<string, { label: string; dot: string; text: string; icon: typeof CheckCircle2 }> = {
  ready: { label: "Ready", dot: "bg-success-500", text: "text-success-700", icon: CheckCircle2 },
  generating: { label: "Generating", dot: "bg-warning-500 animate-pulse", text: "text-warning-700", icon: Clock },
  draft: { label: "Draft", dot: "bg-ink-300", text: "text-ink-600", icon: Clock },
  failed: { label: "Failed", dot: "bg-danger-500", text: "text-danger-700", icon: AlertCircle },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, dot: "bg-ink-300", text: "text-ink-600", icon: Clock };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

/** "Today" / "Yesterday" / "March 2026" — the heading a scanner expects. */
function groupLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return isSameMonth(d, new Date()) ? "This month" : format(d, "MMMM yyyy");
}

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
  const [sort, setSort] = useState<string>("newest");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const firstRender = useRef(true);

  const filtersActive = Boolean(query.trim() || clientId || status || sort !== "newest");

  const fetchPage = useCallback(
    async (offset: number): Promise<{ rows: ReportRow[]; hasMore: boolean } | null> => {
      const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE), sort });
      if (query.trim()) params.set("q", query.trim());
      if (clientId) params.set("clientId", clientId);
      if (status) params.set("status", status);
      const res = await fetch(`/api/reports/list?${params}`, { cache: "no-store" });
      if (!res.ok) return null;
      return res.json();
    },
    [query, clientId, status, sort]
  );

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

  function clearFilters() {
    setQuery(""); setClientId(""); setStatus(""); setSort("newest");
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

  // Month/day buckets, preserving server order within each group.
  const groups = useMemo(() => {
    const out: { label: string; rows: ReportRow[] }[] = [];
    for (const r of rows) {
      const label = groupLabel(sort === "period" && r.period_end ? r.period_end : r.created_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.rows.push(r);
      else out.push({ label, rows: [r] });
    }
    return out;
  }, [rows, sort]);

  // A workspace with no reports at all is a different problem from a filter
  // that matched nothing, and needs a different answer.
  if (!hasAny) {
    return (
      <EmptyState
        icon={FileBarChart2}
        title="No reports yet"
        description="Reports turn a client's synced data into a branded, shareable document with an AI-written summary. Open a client with a connected data source to generate your first one."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild><Link href="/dashboard/clients">Go to clients</Link></Button>
            <Button asChild variant="outline"><Link href="/dashboard/reports/preview">See a sample</Link></Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input
            placeholder="Search by report title or client…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 pr-9"
            aria-label="Search reports"
          />
          {loading ? (
            <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-400" aria-hidden />
          ) : query ? (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <X size={14} aria-hidden />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            aria-label="Filter by client"
            className="field h-10"
          >
            <option value="">All clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
            className="field h-10"
          >
            <option value="">All statuses</option>
            <option value="ready">Ready</option>
            <option value="generating">Generating</option>
            <option value="draft">Draft</option>
            <option value="failed">Failed</option>
          </select>

          <div className="relative">
            <ArrowUpDown size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort reports"
              className="field h-10 pl-8 pr-3"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Active filters — visible state beats a control the user has to re-open
          to remember what they set. */}
      {filtersActive && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-500">
            {rows.length}{hasMore ? "+" : ""} {rows.length === 1 ? "report" : "reports"}
          </span>
          {query.trim() && <Chip onClear={() => setQuery("")}>“{query.trim()}”</Chip>}
          {clientId && <Chip onClear={() => setClientId("")}>{clients.find((c) => c.id === clientId)?.name ?? "Client"}</Chip>}
          {status && <Chip onClear={() => setStatus("")}>{STATUS[status]?.label ?? status}</Chip>}
          {sort !== "newest" && <Chip onClear={() => setSort("newest")}>{SORTS.find((s) => s.key === sort)?.label}</Chip>}
          <button onClick={clearFilters} className="font-medium text-brand-600 hover:underline">Clear all</button>
        </div>
      )}

      {/* Results. Kept mounted and dimmed while refetching so the page doesn't
          collapse and re-expand on every keystroke. */}
      {rows.length === 0 ? (
        loading ? (
          <SkeletonList />
        ) : (
          <div className="rounded-2xl border border-dashed border-ink-200 px-6 py-12 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-surface-muted text-ink-400">
              <Inbox size={20} aria-hidden />
            </span>
            <p className="mt-3 text-sm font-medium text-ink-800">No reports match these filters</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
              Try a different client or status, or widen your search.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>Clear all filters</Button>
          </div>
        )
      ) : (
        <>
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {groups.map((g) => (
              <section key={g.label} className="mb-5">
                <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">{g.label}</h2>
                <div className="space-y-2.5">
                  {g.rows.map((r) => <ReportItem key={r.id} r={r} onDelete={() => remove(r.id, r.title)} />)}
                </div>
              </section>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Loading…</> : "Load more reports"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700">
      {children}
      <button onClick={onClear} aria-label="Remove filter" className="rounded-full p-0.5 hover:bg-brand-100">
        <X size={11} aria-hidden />
      </button>
    </span>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent className="flex items-center gap-3 p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReportItem({ r, onDelete }: { r: ReportRow; onDelete: () => void }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const menuRef = useDismissable<HTMLDivElement>(menu, () => setMenu(false));
  const canShare = r.status === "ready" && !!r.share_token;

  const period =
    r.period_start && r.period_end
      ? `${format(new Date(r.period_start), "d MMM")} – ${format(new Date(r.period_end), "d MMM yyyy")}`
      : null;


  const typeLabel = reportTypeLabel(r.reportType);
  // Display names, never raw ids, and capped so a six-source report can't blow
  // out the row as report volume grows.
  const names = r.sourceIds?.length ? sourceNames(r.sourceIds) : [];
  const sourceLabel =
    names.length === 0 ? null
    : names.length <= 3 ? names.join(", ")
    : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;

  function share() {
    const url = `${window.location.origin}/r/${r.share_token}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Share link copied", { description: "Anyone with this link can view the report." }),
      () => toast.error("Couldn't copy the link")
    );
    setMenu(false);
  }

  // Reuses the existing endpoint and its hash check: unchanged data is a no-op
  // rather than a fresh (billable) model call.
  async function regenerate() {
    setMenu(false);
    setRegenerating(true);
    try {
      const res = await fetch(`/api/reports/${r.id}/regenerate-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? "Couldn't regenerate the insights.");
        return;
      }
      toast.success("AI insights regenerated");
      router.refresh();
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <Card className="group transition-all hover:border-ink-200">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <Link href={`/dashboard/reports/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            {regenerating ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <FileBarChart2 size={18} aria-hidden />}
          </div>
          <div className="min-w-0">
            {/* The title keeps its period suffix here. This list is exactly
                where identical titles hurt — four "Umair Ali — SEO Report"
                rows told the reader nothing — so the coarse month range earns
                its place in the scannable heading even though the exact dates
                repeat it beneath at finer granularity. */}
            <p className="truncate font-medium text-ink-900">{r.title}</p>
            {/* Reporting period leads; the generated date is secondary and
                trails. Type and sources answer "what kind of report is this,
                built from what?" without opening it. */}
            <p className="truncate text-xs text-ink-500">
              <span className="font-medium text-ink-600">{r.clientName}</span>
              {period ? <> · <span className="font-medium text-ink-700">{period}</span></> : null}
              {typeLabel ? <> · {typeLabel}</> : null}
            </p>
            <p className="truncate text-[11px] text-ink-400">
              {sourceLabel ? <>{sourceLabel} · </> : null}
              created {format(new Date(r.created_at), "d MMM yyyy")}
            </p>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          {/* Delivery at a glance — "was this actually sent?" is the second
              question after "is it ready?", and it used to need a page load. */}
          {(r.failedCount ?? 0) > 0 ? (
            <span className="hidden items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-medium text-danger-700 sm:inline-flex" title={`${r.failedCount} failed deliveries`}>
              <AlertCircle size={11} aria-hidden /> {r.failedCount} failed
            </span>
          ) : (r.sentCount ?? 0) > 0 ? (
            <span className="hidden items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-600 sm:inline-flex" title={`Emailed ${r.sentCount} time(s)`}>
              <Send size={10} aria-hidden /> {r.sentCount}
            </span>
          ) : null}

          <StatusPill status={r.status} />

          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link href={`/dashboard/reports/${r.id}`}><Eye size={15} aria-hidden /> View</Link>
          </Button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenu((o) => !o)}
              aria-label={`Actions for ${r.title}`}
              aria-haspopup="menu"
              aria-expanded={menu}
              className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-700 focus-ring"
            >
              <MoreHorizontal size={18} aria-hidden />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-ink-200 bg-surface py-1 shadow-lg">
                <MenuLink href={`/dashboard/reports/${r.id}`} onClick={() => setMenu(false)} icon={<Eye size={15} aria-hidden />}>
                  View report
                </MenuLink>
                {canShare && (
                  <>
                    <MenuButton onClick={share} icon={<Share2 size={15} aria-hidden />}>Copy share link</MenuButton>
                    <MenuLink
                      href={`/api/reports/${r.id}/pdf`}
                      onClick={() => setMenu(false)}
                      icon={<Download size={15} aria-hidden />}
                    >
                      Download PDF
                    </MenuLink>
                  </>
                )}
                <MenuButton onClick={regenerate} icon={<Sparkles size={15} aria-hidden />}>Regenerate insights</MenuButton>
                <MenuLink
                  href={`/dashboard/reports/${r.id}#delivery`}
                  onClick={() => setMenu(false)}
                  icon={<Send size={15} aria-hidden />}
                >
                  Delivery history
                </MenuLink>
                <button
                  role="menuitem"
                  onClick={() => { setMenu(false); onDelete(); }}
                  className="flex w-full items-center gap-2 border-t border-ink-100 px-3 py-2 text-left text-sm text-danger-600 hover:bg-danger-50"
                >
                  <Trash2 size={15} aria-hidden /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MenuLink({ href, onClick, icon, children }: { href: string; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link role="menuitem" href={href} onClick={onClick} className="flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-surface-subtle">
      {icon} {children}
    </Link>
  );
}

function MenuButton({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button role="menuitem" onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-surface-subtle">
      {icon} {children}
    </button>
  );
}

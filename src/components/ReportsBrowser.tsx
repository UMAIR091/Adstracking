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
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Search, MoreHorizontal, Eye, Share2, Download, Trash2, Loader2,
  X, ArrowUpDown, Sparkles, Send, CheckCircle2, AlertCircle, Clock, Inbox,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { reportTypeLabel, sourceNames } from "@/lib/reports/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/ui/segmented";
import { StatusDot, type StatusTone } from "@/components/ui/status-chip";
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
  /** The latest delivery attempt, when the page loaded it (first page only). */
  lastTo?: string | null;
  lastAt?: string | null;
};

type Delivery = "all" | "sent" | "unsent" | "failed";

/** Delivery state from email_logs counts: any failure wins, then any send. */
export function deliveryOf(r: Pick<ReportRow, "sentCount" | "failedCount">): Exclude<Delivery, "all"> {
  if ((r.failedCount ?? 0) > 0) return "failed";
  if ((r.sentCount ?? 0) > 0) return "sent";
  return "unsent";
}

const DELIVERY: Record<Exclude<Delivery, "all">, { tone: StatusTone; cta: string }> = {
  sent: { tone: "success", cta: "Open" },
  failed: { tone: "danger", cta: "Resend" },
  unsent: { tone: "muted", cta: "Review" },
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
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-muted px-[9px] py-[3px] text-xs font-medium ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

const GRID = "grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1.8fr)_auto] items-center gap-3";

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
  const [delivery, setDelivery] = useState<Delivery>("all");
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
    setQuery(""); setClientId(""); setStatus(""); setSort("newest"); setDelivery("all");
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

  // Delivery state comes from email_logs counts the list already carries. The
  // list API can't filter on it, so this filter applies to the reports loaded
  // so far; "Load more" stays available and the note below says so.
  const shown = useMemo(() => (delivery === "all" ? rows : rows.filter((r) => deliveryOf(r) === delivery)), [rows, delivery]);
  const counts = useMemo(() => {
    const c = { sent: 0, unsent: 0, failed: 0 };
    for (const r of rows) c[deliveryOf(r)]++;
    return c;
  }, [rows]);

  // A workspace with no reports at all is a different problem from a filter
  // that matched nothing, and needs a different answer.
  if (!hasAny) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-300 bg-surface px-6 py-14 text-center">
        <h2 className="text-lg font-semibold text-ink-900">No reports yet</h2>
        <p className="mx-auto mt-1.5 max-w-[420px] text-sm leading-relaxed text-ink-500">
          Reports are generated per client. Add a client and connect a data source, then your first branded report is
          one click away.
        </p>
        <div className="mt-[18px] flex flex-wrap justify-center gap-2">
          <Button asChild><Link href="/dashboard/clients">Go to clients</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/reports/preview">Open sample report</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Segmented<Delivery>
        label="Filter reports by delivery"
        value={delivery}
        onChange={setDelivery}
        className="self-start"
        options={[
          { value: "all", label: "All" },
          { value: "sent", label: "Delivered", count: counts.sent },
          { value: "unsent", label: "Not sent", count: counts.unsent },
          { value: "failed", label: "Failed delivery", count: counts.failed },
        ]}
      />

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

      {delivery !== "all" && hasMore && (
        <p className="text-xs text-ink-500">
          Showing matches among the {rows.length} reports loaded so far. Load more to search further back.
        </p>
      )}

      {/* Results. Kept mounted and dimmed while refetching so the page doesn't
          collapse and re-expand on every keystroke. */}
      {shown.length === 0 ? (
        loading ? (
          <SkeletonList />
        ) : (
          <div className="rounded-2xl border border-dashed border-ink-300 bg-surface px-6 py-12 text-center">
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
          <section
            aria-label="Reports"
            className={`overflow-hidden rounded-card border border-ink-200 bg-surface ${loading ? "opacity-60 transition-opacity" : "transition-opacity"}`}
          >
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div aria-hidden className={`${GRID} border-b border-ink-100 bg-ink-50 px-[18px] py-2.5 text-xs text-ink-400`}>
                  <span>Report</span>
                  <span>Client</span>
                  <span>Period</span>
                  <span>Delivery</span>
                  <span className="w-[150px]" />
                </div>
                <ul>
                  {shown.map((r) => <ReportItem key={r.id} r={r} onDelete={() => remove(r.id, r.title)} />)}
                </ul>
              </div>
            </div>
          </section>

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
    <div className="overflow-hidden rounded-card border border-ink-200 bg-surface">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`flex items-center gap-3 px-[18px] py-[13px] ${i ? "border-t border-ink-100" : ""}`}>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-1/5" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
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

  const d = deliveryOf(r);
  const deliveryText =
    d === "failed"
      ? `Failed · ${r.failedCount} attempt${r.failedCount === 1 ? "" : "s"}`
      : d === "sent"
        ? r.lastTo
          ? `Sent to ${r.lastTo}${r.lastAt ? ` · ${format(new Date(r.lastAt), "d MMM")}` : ""}`
          : `Sent ${r.sentCount} time${r.sentCount === 1 ? "" : "s"}`
        : "Not sent yet";

  return (
    <li className={`${GRID} relative border-b border-ink-100 px-[18px] py-[13px] text-[13.5px] transition-colors last:border-b-0 hover:bg-ink-50`}>
      <span className="min-w-0">
        {/* The title is the row's link; the overlay makes the whole row
            clickable while the menu stays its own target. Type and sources
            answer "what kind of report, built from what?" without opening it. */}
        <Link href={`/dashboard/reports/${r.id}`} className="flex items-center gap-1.5 truncate font-medium text-ink-900 after:absolute after:inset-0 after:content-['']">
          {regenerating && <Loader2 size={13} className="shrink-0 animate-spin" aria-hidden />}
          <span className="truncate">{r.title}</span>
        </Link>
        <span className="block truncate text-xs text-ink-400">
          Generated {format(new Date(r.created_at), "d MMM yyyy")}
          {typeLabel ? <> · {typeLabel}</> : null}
          {sourceLabel ? <> · {sourceLabel}</> : null}
        </span>
      </span>
      <span className="truncate text-ink-900">{r.clientName}</span>
      <span className="truncate text-ink-500">{period ?? "—"}</span>
      <span className="flex min-w-0 items-center gap-2">
        <StatusDot tone={DELIVERY[d].tone} className="h-[7px] w-[7px]" />
        <span className={`truncate ${d === "failed" ? "text-danger-700" : "text-ink-500"}`}>{deliveryText}</span>
      </span>

      <span className="relative z-10 flex w-[150px] items-center justify-end gap-2">
        {r.status !== "ready" && <StatusPill status={r.status} />}
        <Link href={`/dashboard/reports/${r.id}${d === "failed" ? "#delivery" : ""}`} className="text-[13px] font-medium text-brand-600 hover:text-ink-900">
          {DELIVERY[d].cta}
        </Link>
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
      </span>
    </li>
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

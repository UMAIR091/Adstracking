"use client";

// Reports management (audit P1 #5 + P2 #10): search, client + status filters,
// "load more" pagination that scales to thousands of rows, the reporting period
// shown clearly, and inline actions (View / Share / Download / Delete) so common
// tasks don't require opening each report.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileBarChart2, Search, MoreHorizontal, Eye, Share2, Download, Trash2, Filter } from "lucide-react";
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

const PAGE = 20;

const statusVariant = (s: string) =>
  s === "ready" ? "success" : s === "failed" ? "muted" : s === "generating" ? "warning" : "muted";

export function ReportsBrowser({ reports }: { reports: ReportRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const confirm = useConfirm();

  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visible, setVisible] = useState(PAGE);
  const [rows, setRows] = useState(reports);

  const clientNames = useMemo(
    () => Array.from(new Set(rows.map((r) => r.clientName))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (clientFilter !== "all" && r.clientName !== clientFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && !(`${r.title} ${r.clientName}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, query, clientFilter, statusFilter]);

  const shown = filtered.slice(0, visible);

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

  if (rows.length === 0) {
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
          <Input
            placeholder="Search reports…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(PAGE); }}
            className="pl-9"
            aria-label="Search reports"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={15} className="hidden text-ink-400 sm:block" />
          <select
            value={clientFilter}
            onChange={(e) => { setClientFilter(e.target.value); setVisible(PAGE); }}
            aria-label="Filter by client"
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="all">All clients</option>
            {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setVisible(PAGE); }}
            aria-label="Filter by status"
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="all">All statuses</option>
            <option value="ready">Ready</option>
            <option value="generating">Generating</option>
            <option value="draft">Draft</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-ink-500">
          No reports match your filters.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {shown.map((r) => <ReportItem key={r.id} r={r} onDelete={() => remove(r.id, r.title)} />)}
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-ink-500">Showing {shown.length} of {filtered.length}</p>
            {visible < filtered.length && (
              <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE)}>
                Load more
              </Button>
            )}
          </div>
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

          {/* Primary action inline on larger screens */}
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link href={`/dashboard/reports/${r.id}`}><Eye size={15} /> View</Link>
          </Button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenu((o) => !o)}
              aria-label="Report actions"
              aria-haspopup="menu"
              aria-expanded={menu}
              className="rounded-lg p-2 text-ink-500 hover:bg-slate-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
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

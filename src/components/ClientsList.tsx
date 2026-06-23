"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, Search, Globe, Plug, Clock, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";

export type ClientRow = {
  id: string;
  name: string;
  logo_url: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  archived: boolean;
  data_sources: { type: string; updated_at: string }[] | null;
};

const INTEGRATION_LABEL: Record<string, string> = { gsc: "Search Console", ga4: "Analytics 4", sheets: "Sheets" };

export function ClientsList({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (c.archived !== showArchived) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.website ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q);
    });
  }, [clients, search, showArchived]);

  const activeCount = clients.filter((c) => !c.archived).length;
  const archivedCount = clients.length - activeCount;

  async function setArchived(id: string, archived: boolean) {
    setBusyId(id);
    setMenuId(null);
    await supabase.from("clients").update({ archived }).eq("id", id);
    setBusyId(null);
    toast.success(archived ? "Client archived" : "Client restored");
    router.refresh();
  }

  async function remove(id: string, name: string) {
    setMenuId(null);
    if (!confirm(`Delete "${name}"? This also removes its reports and cannot be undone.`)) return;
    setBusyId(id);
    await supabase.from("clients").delete().eq("id", id);
    setBusyId(null);
    toast.success("Client deleted");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-sm">
          <button onClick={() => setShowArchived(false)} className={`rounded-md px-3 py-1.5 transition-colors ${!showArchived ? "bg-brand-500 text-white" : "text-ink-700"}`}>
            Active ({activeCount})
          </button>
          <button onClick={() => setShowArchived(true)} className={`rounded-md px-3 py-1.5 transition-colors ${showArchived ? "bg-brand-500 text-white" : "text-ink-700"}`}>
            Archived ({archivedCount})
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        showArchived || search ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-ink-500">
            {showArchived ? "No archived clients." : "No clients match your search."}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No clients yet"
            description="Add your first client to start connecting data and sending reports."
            action={<Button asChild><Link href="/dashboard/clients/new">Add your first client</Link></Button>}
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => {
            const sources = c.data_sources ?? [];
            const lastSync = sources.map((s) => s.updated_at).sort().at(-1);
            const status = c.archived ? "Archived" : sources.length ? "Active" : "Needs setup";
            const statusVariant = c.archived ? "muted" : sources.length ? "success" : "warning";
            return (
              <Card key={c.id} className="group relative flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                {/* menu */}
                <div className="absolute right-3 top-3">
                  <button onClick={() => setMenuId(menuId === c.id ? null : c.id)} className="rounded-md p-1.5 text-ink-400 hover:bg-slate-100" disabled={busyId === c.id}>
                    <MoreHorizontal size={16} />
                  </button>
                  {menuId === c.id && (
                    <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      <Link href={`/dashboard/clients/${c.id}/edit`} className="block px-3 py-1.5 text-sm text-ink-700 hover:bg-slate-50">Edit</Link>
                      <button onClick={() => setArchived(c.id, !c.archived)} className="block w-full px-3 py-1.5 text-left text-sm text-ink-700 hover:bg-slate-50">
                        {c.archived ? "Unarchive" : "Archive"}
                      </button>
                      <button onClick={() => remove(c.id, c.name)} className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">Delete</button>
                    </div>
                  )}
                </div>

                <Link href={`/dashboard/clients/${c.id}`} className="flex items-center gap-3 pr-6">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-ink-500">
                    {c.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      c.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900 group-hover:text-brand-600">{c.name}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-ink-500">
                      <Globe size={12} /> {c.website || c.email || "No website"}
                    </p>
                  </div>
                </Link>

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {sources.length ? (
                    sources.map((s) => <Badge key={s.type} variant="default">{INTEGRATION_LABEL[s.type] ?? s.type}</Badge>)
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-ink-400"><Plug size={12} /> No integrations</span>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="flex items-center gap-1 text-xs text-ink-400">
                    <Clock size={12} /> {lastSync ? `Synced ${format(new Date(lastSync), "MMM d")}` : "Never synced"}
                  </span>
                  <Badge variant={statusVariant}>{status}</Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

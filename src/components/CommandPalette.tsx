"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, LayoutDashboard, Users, UserPlus, FileBarChart2, Eye, Cable, Settings, CreditCard } from "lucide-react";

const ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Clients", href: "/dashboard/clients", icon: Users },
  { label: "Add client", href: "/dashboard/clients/new", icon: UserPlus },
  { label: "Reports", href: "/dashboard/reports", icon: FileBarChart2 },
  { label: "Preview report", href: "/dashboard/reports/preview", icon: Eye },
  { label: "Integrations", href: "/dashboard/integrations", icon: Cable },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command", onOpen);
    };
  }, []);

  if (!open) return null;

  const items = ITEMS.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <Search size={18} className="text-ink-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-ink-400">ESC</kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-400">No results</li>}
          {items.map((i) => {
            const Icon = i.icon;
            return (
              <li key={i.href}>
                <button onClick={() => go(i.href)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-slate-100">
                  <Icon size={16} className="text-ink-400" />
                  {i.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function CommandTrigger({ className = "" }: { className?: string }) {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("open-command"))}
      className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-ink-400 transition-colors hover:bg-slate-100 ${className}`}
    >
      <Search size={15} />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-ink-500">⌘K</kbd>
    </button>
  );
}

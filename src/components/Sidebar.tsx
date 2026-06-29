"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, FileBarChart2, Cable, Settings, LogOut, Menu, X, Search, ChevronUp } from "lucide-react";
import { Brand } from "@/components/Brand";
import { CommandTrigger } from "@/components/CommandPalette";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/clients", label: "Clients", icon: Users },
  { href: "/dashboard/reports", label: "Reports", icon: FileBarChart2 },
  { href: "/dashboard/integrations", label: "Integrations", icon: Cable },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map((item) => {
        const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
            )}
          >
            {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />}
            <Icon size={18} strokeWidth={active ? 2.4 : 2} className={cn("transition-colors", !active && "text-ink-400 group-hover:text-ink-600")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountMenu({ email, agencyName }: { email: string; agencyName: string }) {
  const [open, setOpen] = useState(false);
  const initials = (email[0] || "U").toUpperCase();
  return (
    <div className="relative border-t border-slate-100 p-3">
      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <Link href="/dashboard/settings" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-ink-700 hover:bg-slate-50">Settings</Link>
          <Link href="/dashboard/billing" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-ink-700 hover:bg-slate-50">Billing</Link>
          <Link href="/dashboard/team" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-ink-700 hover:bg-slate-50">Team</Link>
          <form action="/auth/signout" method="post" className="border-t border-slate-100">
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-600 hover:bg-slate-50"><LogOut size={15} /> Sign out</button>
          </form>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-100">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-800">{agencyName}</p>
          <p className="truncate text-xs text-ink-400">{email}</p>
        </div>
        <ChevronUp size={16} className={cn("text-ink-400 transition-transform", open && "rotate-180")} />
      </button>
    </div>
  );
}

export function Sidebar({ agencyName, userEmail }: { agencyName: string; userEmail: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/dashboard"><Brand /></Link>
        </div>
        <div className="px-3 pb-2">
          <CommandTrigger className="w-full" />
        </div>
        <NavLinks pathname={pathname} />
        <AccountMenu email={userEmail} agencyName={agencyName} />
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Link href="/dashboard"><Brand /></Link>
        <div className="flex items-center gap-1">
          <button onClick={() => window.dispatchEvent(new Event("open-command"))} aria-label="Search" className="rounded-lg p-2 text-ink-600 hover:bg-slate-100">
            <Search size={18} />
          </button>
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 text-ink-600 hover:bg-slate-100">
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between px-5">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-ink-600 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <AccountMenu email={userEmail} agencyName={agencyName} />
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, FileBarChart2, Cable, Settings, LogOut, Menu, X, Search, ChevronUp } from "lucide-react";
import { Brand } from "@/components/Brand";
import { CommandTrigger } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useDismissable } from "@/lib/useDismissable";
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
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {NAV.map((item) => {
        const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            // The selected row is a white "card" lifted off the muted rail —
            // the same figure/ground relationship the content area uses, so
            // selection reads structurally rather than as a colour wash.
            className={cn(
              "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150",
              active
                ? "bg-surface font-semibold text-ink-900 shadow-xs ring-1 ring-ink-200/70"
                : "font-medium text-ink-600 hover:bg-ink-100/70 hover:text-ink-900"
            )}
          >
            <Icon
              size={17}
              strokeWidth={active ? 2.2 : 1.9}
              className={cn("shrink-0 transition-colors", active ? "text-brand-500" : "text-ink-400 group-hover:text-ink-600")}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountMenu({ email, agencyName }: { email: string; agencyName: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false));
  const initials = (email[0] || "U").toUpperCase();
  return (
    // The theme control sits directly above the account row, at the foot of the
    // rail: present on every screen of the app, in both the desktop sidebar and
    // the mobile drawer, without competing with navigation.
    <div ref={ref} className="relative border-t border-ink-200 p-3">
      {open && (
        <div role="menu" className="animate-fade-in absolute bottom-full left-3 right-3 mb-1.5 overflow-hidden rounded-xl border border-ink-200 bg-surface py-1 shadow-lg">
          <Link href="/dashboard/settings" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900">Settings</Link>
          <Link href="/dashboard/billing" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900">Billing</Link>
          <Link href="/dashboard/team" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900">Team</Link>
          <Link href="/help" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900">Help Center</Link>
          <form action="/auth/signout" method="post" className="mt-1 border-t border-ink-200">
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"><LogOut size={15} /> Sign out</button>
          </form>
        </div>
      )}
      <ThemeToggle className="mb-2 w-full" />

      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-ink-100/70 focus-ring">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-solid text-xs font-semibold text-white">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-800">{agencyName}</p>
          <p className="truncate text-xs text-ink-500">{email}</p>
        </div>
        <ChevronUp size={16} className={cn("text-ink-500 transition-transform", open && "rotate-180")} />
      </button>
    </div>
  );
}

export function Sidebar({ agencyName, userEmail }: { agencyName: string; userEmail: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* The sidebar sits on the muted page tone rather than card white, so
          cards read as raised against it. */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-ink-200 bg-sidebar lg:flex">
        <div className="flex h-16 items-center justify-between gap-2 px-5">
          <Link href="/dashboard"><Brand /></Link>
        </div>
        <div className="px-3 pb-2">
          <CommandTrigger className="w-full" />
        </div>
        <NavLinks pathname={pathname} />
        <AccountMenu email={userEmail} agencyName={agencyName} />
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-200 bg-surface px-4 lg:hidden">
        <Link href="/dashboard"><Brand /></Link>
        <div className="flex items-center gap-1">
          <button onClick={() => window.dispatchEvent(new Event("open-command"))} aria-label="Search" className="rounded-lg p-2 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900">
            <Search size={18} />
          </button>
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900">
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-overlay/40" onClick={() => setOpen(false)} />
          {/* The border, not the shadow, is what separates the drawer from the
              scrim on the dark theme. */}
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-ink-200 bg-sidebar shadow-xl">
            <div className="flex h-14 items-center justify-between px-5">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-ink-600 hover:bg-ink-100"><X size={20} /></button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <AccountMenu email={userEmail} agencyName={agencyName} />
          </div>
        </div>
      )}
    </>
  );
}

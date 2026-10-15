"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, FileText, Plug, SlidersHorizontal, HelpCircle,
  LogOut, Menu, X, Search, ChevronsUpDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StatusDot, type StatusTone } from "@/components/ui/status-chip";
import { useDismissable } from "@/lib/useDismissable";
import { cn } from "@/lib/utils";

// The app shell's navigation rail: ink in both themes (the --nav-* tokens),
// built around the agency workflow. Workspace identity and plan at the top,
// search, the four places work happens, the clients touched most recently, then
// settings, help, plan usage and the account menu at the foot. The same
// contents slide in as a drawer below lg.

export type SidebarData = {
  agencyName: string;
  agencyLogo: string | null;
  brandColor: string | null;
  planLabel: string;
  userEmail: string;
  /** Active (non-archived) clients. */
  clientCount: number;
  /** The plan's client allowance; null when unlimited. */
  clientLimit: number | null;
  /** Data sources the user has to act on (summarize(health).needsAttention). */
  attentionCount: number;
  recent: { id: string; name: string; tone: StatusTone; statusLabel: string }[];
};

type NavItem = { href: string; label: string; icon: LucideIcon; count?: number; badge?: number };

const isActive = (pathname: string, href: string) =>
  href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

const SETTINGS_PATHS = ["/dashboard/settings", "/dashboard/team", "/dashboard/billing"];

function Row({
  href, label, icon: Icon, active, count, badge, onNavigate, mobile,
}: NavItem & { active: boolean; onNavigate?: () => void; mobile?: boolean }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-[11px] rounded-[9px] px-2.5 text-sm transition-colors",
        mobile ? "min-h-[44px]" : "py-2",
        active ? "bg-nav-active font-semibold text-nav-strong" : "font-medium text-nav-fg hover:bg-nav-hover hover:text-nav-strong"
      )}
    >
      <Icon size={17} strokeWidth={1.9} aria-hidden className="shrink-0" />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="min-w-[20px] rounded-full bg-danger-500 px-1.5 py-px text-center text-[11px] font-semibold text-white">
          {badge}
          <span className="sr-only"> need attention</span>
        </span>
      ) : null}
      {count !== undefined && count > 0 ? <span className="font-app-mono text-[11.5px] text-nav-dim">{count}</span> : null}
    </Link>
  );
}

function AgencyTile({ name, logo, color, size = 30 }: { name: string; logo: string | null; color: string | null; size?: number }) {
  if (logo) {
    return (
      <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" decoding="async" className="max-h-full max-w-full object-contain p-0.5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white"
      style={{ width: size, height: size, background: color || "#0F7A6C" }}
    >
      {(name || "A").charAt(0).toUpperCase()}
    </span>
  );
}

function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false));
  const item = "block px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900";
  return (
    <div ref={ref} className="relative px-3 pb-4 pt-2">
      {open && (
        <div className="animate-fade-in absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-card border border-ink-200 bg-surface py-1 text-ink-900 shadow-lg">
          <Link href="/dashboard/settings" onClick={() => setOpen(false)} className={item}>Settings</Link>
          <Link href="/dashboard/billing" onClick={() => setOpen(false)} className={item}>Billing</Link>
          <Link href="/dashboard/team" onClick={() => setOpen(false)} className={item}>Team</Link>
          <Link href="/help" onClick={() => setOpen(false)} className={item}>Help Center</Link>
          <div className="border-t border-ink-100 px-3 py-2">
            <ThemeToggle className="w-full" />
          </div>
          <form action="/auth/signout" method="post" className="border-t border-ink-100">
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900">
              <LogOut size={15} aria-hidden /> Sign out
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Account menu for ${email}`}
        className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-nav-hover"
      >
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-site-amber text-xs font-bold text-nav-bg">
          {(email[0] || "U").toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-nav-dim">{email}</span>
      </button>
    </div>
  );
}

function SidebarBody({ data, pathname, onNavigate, mobile }: { data: SidebarData; pathname: string; onNavigate?: () => void; mobile?: boolean }) {
  const nav: NavItem[] = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/dashboard/clients", label: "Clients", icon: Users, count: data.clientCount },
    { href: "/dashboard/reports", label: "Reports", icon: FileText },
    { href: "/dashboard/integrations", label: "Integrations", icon: Plug, badge: data.attentionCount },
  ];
  const settingsActive = SETTINGS_PATHS.some((p) => isActive(pathname, p));
  const pct = data.clientLimit ? Math.min(100, Math.round((data.clientCount / data.clientLimit) * 100)) : 0;
  // Green with room to spare, amber at the limit, red once over it (a plan
  // downgrade can leave more active clients than the plan allows).
  const meter = !data.clientLimit || data.clientCount < data.clientLimit ? "bg-nav-electric" : data.clientCount === data.clientLimit ? "bg-warning-500" : "bg-danger-500";
  const usage = data.clientLimit ? `${data.clientCount} / ${data.clientLimit}` : `${data.clientCount}`;

  return (
    <>
      <div className="px-3">
        <Link
          href="/dashboard/settings"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-control bg-nav-panel px-2.5 py-[9px] transition-colors hover:bg-nav-active"
        >
          <AgencyTile name={data.agencyName} logo={data.agencyLogo} color={data.brandColor} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-nav-strong">{data.agencyName}</span>
            <span className="block text-[11.5px] text-nav-dim">{data.planLabel}</span>
          </span>
          <ChevronsUpDown size={14} aria-hidden className="text-nav-dim" />
        </Link>
        <button
          type="button"
          onClick={() => { onNavigate?.(); window.dispatchEvent(new Event("open-command")); }}
          className={cn(
            "mt-2.5 flex w-full items-center gap-2 rounded-[9px] border border-nav-line px-2.5 text-[13px] text-nav-dim transition-colors hover:border-nav-dim hover:text-nav-fg",
            mobile ? "min-h-[44px]" : "py-2"
          )}
        >
          <Search size={15} aria-hidden />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="rounded-[5px] border border-nav-line px-1.5 py-px font-app-mono text-[11px]">⌘K</kbd>
        </button>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-0.5 px-3 pt-4">
        {nav.map((n) => (
          <Row key={n.href} {...n} active={isActive(pathname, n.href)} onNavigate={onNavigate} mobile={mobile} />
        ))}
      </nav>

      {data.recent.length > 0 && (
        <div className="px-3 pt-[22px]">
          <h2 className="px-2.5 pb-1.5 font-app-mono text-[10.5px] uppercase tracking-[0.08em] text-nav-dim">Recent clients</h2>
          <ul className="flex flex-col gap-0.5">
            {data.recent.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/clients/${c.id}`}
                  onClick={onNavigate}
                  aria-current={isActive(pathname, `/dashboard/clients/${c.id}`) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] text-nav-fg transition-colors hover:bg-nav-hover hover:text-nav-strong",
                    mobile ? "min-h-[44px]" : "py-[7px]"
                  )}
                >
                  <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-nav-panel text-[10.5px] font-bold text-nav-strong">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <StatusDot tone={c.tone} className="h-[7px] w-[7px]" />
                  <span className="sr-only">{c.statusLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1" />

      <div className="flex flex-col gap-0.5 px-3 pb-1.5 pt-4">
        <Row href="/dashboard/settings" label="Settings" icon={SlidersHorizontal} active={settingsActive} onNavigate={onNavigate} mobile={mobile} />
        <Row href="/help" label="Help center" icon={HelpCircle} active={false} onNavigate={onNavigate} mobile={mobile} />
      </div>

      <Link
        href="/dashboard/billing"
        onClick={onNavigate}
        className="mx-3 mt-1.5 block rounded-control bg-nav-panel p-3 transition-colors hover:bg-nav-active"
      >
        <span className="flex justify-between text-xs text-nav-dim">
          <span>Active clients</span>
          <span className="font-app-mono text-nav-strong">{usage}</span>
        </span>
        {data.clientLimit ? (
          <span
            role="progressbar"
            aria-label="Active clients used"
            aria-valuemin={0}
            aria-valuemax={data.clientLimit}
            aria-valuenow={data.clientCount}
            className="mt-2 block h-[5px] overflow-hidden rounded-[3px] bg-nav-line"
          >
            <span className={`block h-[5px] rounded-[3px] ${meter}`} style={{ width: `${pct}%` }} />
          </span>
        ) : null}
      </Link>

      <AccountMenu email={data.userEmail} />
    </>
  );
}

export function Sidebar({ data }: { data: SidebarData }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Drawer: Esc closes it, focus moves in on open and back to the menu button
  // on close, and the page behind doesn't scroll.
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      menuButton.current?.focus();
    };
  }, [open]);

  // Focus on the rail reads in the logo's bright green: teal sinks on ink.
  const rail = "flex-col bg-nav-bg text-nav-fg [--ring:var(--nav-electric)]";

  return (
    <>
      <aside aria-label="Sidebar" className={cn("no-print fixed inset-y-0 left-0 z-30 hidden w-[248px] overflow-y-auto border-r border-nav-line lg:flex", rail)}>
        <div className="px-[18px] pb-3.5 pt-[18px]">
          <Link href="/dashboard" aria-label="Anavyst home"><Brand reversed className="text-[14px]" /></Link>
        </div>
        <SidebarBody data={data} pathname={pathname} />
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-ink-200 bg-surface px-3.5 py-1.5 lg:hidden">
        <Link href="/dashboard" aria-label="Anavyst home"><Brand className="text-[13px]" /></Link>
        <div className="flex items-center gap-1">
          <button
            onClick={() => window.dispatchEvent(new Event("open-command"))}
            aria-label="Search"
            className="flex h-11 w-11 items-center justify-center rounded-control text-ink-700 transition-colors hover:bg-ink-100"
          >
            <Search size={19} />
          </button>
          <button
            ref={menuButton}
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="flex h-11 w-11 items-center justify-center rounded-control text-ink-700 transition-colors hover:bg-ink-100"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-overlay/45" onClick={() => setOpen(false)} />
          <div className={cn("absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] overflow-y-auto shadow-xl", rail)}>
            <div className="flex items-center justify-between py-2 pl-[18px] pr-2">
              <Brand reversed className="text-[13px]" />
              <button
                ref={closeButton}
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-control text-nav-fg hover:bg-nav-hover"
              >
                <X size={20} />
              </button>
            </div>
            <SidebarBody data={data} pathname={pathname} onNavigate={() => setOpen(false)} mobile />
          </div>
        </div>
      )}
    </>
  );
}

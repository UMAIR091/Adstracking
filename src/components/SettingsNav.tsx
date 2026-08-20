"use client";

// Grouped navigation for Settings.
//
// The settings pages already existed as separate routes but had nothing tying
// them together, so they were only reachable from links scattered across the
// app. This groups the EXISTING pages — no new settings, no moved routes, no
// changed behaviour — so the area reads as one place with a clear structure.
//
// Cross-links to Team, Billing and Integrations point at their own top-level
// routes; they belong to these groups conceptually even though they live
// outside /dashboard/settings.
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { label: string; href: string };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Workspace",
    items: [
      { label: "General & branding", href: "/dashboard/settings" },
      { label: "Team", href: "/dashboard/team" },
    ],
  },
  {
    title: "Integrations",
    items: [
      { label: "Connected accounts", href: "/dashboard/integrations" },
      { label: "Integration health", href: "/dashboard/settings/health" },
      { label: "Sync health", href: "/dashboard/settings/errors" },
    ],
  },
  {
    title: "Billing",
    items: [
      { label: "Plan & payment", href: "/dashboard/billing" },
      { label: "Usage", href: "/dashboard/settings/usage" },
    ],
  },
  {
    title: "Data",
    items: [{ label: "Data & privacy", href: "/dashboard/settings/data" }],
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="lg:w-56 lg:shrink-0">
      <div className="flex gap-6 overflow-x-auto pb-2 lg:block lg:space-y-6 lg:overflow-visible lg:pb-0">
        {GROUPS.map((g) => (
          <div key={g.title} className="min-w-max lg:min-w-0">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">{g.title}</p>
            <ul className="flex gap-1 lg:block lg:space-y-0.5">
              {g.items.map((item) => {
                // Exact match only — /dashboard/settings must not stay active
                // while a child route like /dashboard/settings/usage is open.
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      // Same selected treatment as the sidebar: a surface card
                      // lifted off the page with a hairline ring, and the accent
                      // carried by the label rather than a colour wash behind
                      // it. Two vertical navigations in one product should not
                      // express "you are here" two different ways.
                      className={`block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        active
                          ? "bg-surface font-semibold text-brand-700 shadow-xs ring-1 ring-ink-200/70"
                          : "font-medium text-ink-600 hover:bg-ink-100/70 hover:text-ink-900"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

"use client";

// Navigation inside one client's workspace.
//
// The client page was a single scroll: Performance, then Data sources, then
// Reporting, each growing independently until finding anything meant scrolling
// past everything. These are the same sections, addressable and persistent —
// the bar stays put while you work, so moving between them never costs the
// header or the sense of which client you are in.
//
// Same vocabulary as SettingsNav (brand-tinted active pill, muted hover,
// horizontal scroll on small screens), so the two navigations in the product
// read as one system.
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { label: string; segment: string };

const TABS: Tab[] = [
  { label: "Overview", segment: "" },
  { label: "Performance", segment: "performance" },
  { label: "Data sources", segment: "data-sources" },
  { label: "Reports", segment: "reports" },
  { label: "Automations", segment: "automations" },
];

export function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/clients/${clientId}`;

  return (
    <nav aria-label="Client sections" className="-mb-px border-b border-ink-200">
      <ul className="flex gap-1 overflow-x-auto pb-px">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          // Exact match: Overview must not stay active while a section is open.
          const active = pathname === href;
          return (
            <li key={tab.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "border-brand-600 font-medium text-brand-700"
                    : "border-transparent text-ink-600 hover:border-ink-300 hover:text-ink-900"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

// Navigation inside one client's workspace: underline tabs with the active one
// in ink, scrolling sideways on small screens. Same sections and routes as
// before; each is addressable and persistent, so moving between them never
// costs the header or the sense of which client you are in.
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
    <nav aria-label="Client sections" className="shadow-[inset_0_-1px_0_rgb(var(--ink-200))]">
      <ul className="flex gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          // Exact match: Overview must not stay active while a section is open.
          const active = pathname === href;
          return (
            <li key={tab.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors ${
                  active
                    ? "border-ink-900 font-semibold text-ink-900"
                    : "border-transparent font-medium text-ink-500 hover:text-ink-900"
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

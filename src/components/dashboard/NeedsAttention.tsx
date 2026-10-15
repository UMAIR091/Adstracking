import Link from "next/link";
import { RotateCw, CircleAlert, TriangleAlert, UserPlus, MailWarning } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The dashboard's action list: every problem the page already knows about, each
// with the one button that fixes it. Derived only from data the page loaded;
// when nothing needs the user it renders nothing at all, because a quiet
// dashboard is the signal.

export type AttentionItem = {
  /** Icon name — Server Components can't pass component references. */
  icon: "reconnect" | "account" | "error" | "client" | "email";
  label: string;
  /** One line of context under the label. */
  detail?: string;
  /** The fix button's label. */
  cta?: string;
  href: string;
  /** Higher = more urgent; the list is sorted on it. */
  weight: number;
};

const ICONS: Record<AttentionItem["icon"], LucideIcon> = {
  reconnect: RotateCw,
  account: CircleAlert,
  error: TriangleAlert,
  client: UserPlus,
  email: MailWarning,
};

const TINTS: Record<AttentionItem["icon"], string> = {
  reconnect: "bg-danger-50 text-danger-600",
  error: "bg-danger-50 text-danger-600",
  email: "bg-danger-50 text-danger-600",
  account: "bg-warning-50 text-warning-600",
  client: "bg-ink-100 text-ink-500",
};

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => b.weight - a.weight);

  return (
    <section aria-labelledby="attention-heading" className="overflow-hidden rounded-card border border-ink-200 bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-[18px] py-3.5">
        <div className="flex items-center gap-2">
          <h2 id="attention-heading" className="text-[15px] font-semibold text-ink-900">Needs attention</h2>
          <span className="rounded-full bg-danger-50 px-2 py-px text-xs font-semibold text-danger-700">{items.length}</span>
        </div>
        <Link href="/dashboard/settings/health" className="text-[13px] font-medium text-brand-600 hover:text-ink-900">
          Integration health
        </Link>
      </div>
      <ul>
        {sorted.map((item, i) => {
          const Icon = ICONS[item.icon];
          return (
            <li
              key={`${item.icon}-${item.label}`}
              className={`flex flex-wrap items-center gap-3.5 px-[18px] py-[13px] sm:flex-nowrap ${i ? "border-t border-ink-100" : ""}`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${TINTS[item.icon]}`}>
                <Icon size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">{item.label}</p>
                {item.detail && <p className="mt-px text-[12.5px] text-ink-400">{item.detail}</p>}
              </div>
              <Link
                href={item.href}
                className="ml-[46px] whitespace-nowrap rounded-[9px] border border-control-line px-3 py-[7px] text-[13px] font-medium text-ink-900 transition-colors hover:border-control-line-hover hover:bg-ink-50 sm:ml-0"
              >
                {item.cta ?? "Fix"}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

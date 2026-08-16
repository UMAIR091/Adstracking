import Link from "next/link";
import { AlertTriangle, PlugZap, Settings, UserPlus, MailWarning, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// The dashboard's action list.
//
// These signals already existed, but each was buried in the hint line of a
// different stat tile — so "2 sources need attention" and "3 clients still need
// a data source" never appeared together, and neither told you where to go.
// This gathers them into one band directly under the KPI row.
//
// Every item is derived from data the page already loaded; nothing here is
// estimated or invented. When there is nothing to act on the component renders
// nothing at all rather than an empty "all clear" card — a quiet dashboard is
// the signal.

export type AttentionItem = {
  /** Icon name — Server Components can't pass component references. */
  icon: "reconnect" | "account" | "error" | "client" | "email";
  label: string;
  href: string;
  /** Higher = more urgent; the list is sorted on it. */
  weight: number;
};

const ICONS: Record<AttentionItem["icon"], LucideIcon> = {
  reconnect: PlugZap,
  account: Settings,
  error: AlertTriangle,
  client: UserPlus,
  email: MailWarning,
};

// Muted tints from the existing palette — no new colours.
const TINTS: Record<AttentionItem["icon"], string> = {
  reconnect: "bg-amber-50 text-amber-600",
  account: "bg-sky-50 text-sky-600",
  error: "bg-rose-50 text-rose-600",
  client: "bg-brand-50 text-brand-600",
  email: "bg-amber-50 text-amber-600",
};

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => b.weight - a.weight);

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="text-sm font-semibold tracking-tight text-ink-900">Needs attention</h2>
        <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {sorted.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <li key={`${item.icon}-${item.label}`}>
                <Link
                  href={item.href}
                  className="group -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted"
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TINTS[item.icon]}`}>
                    <Icon size={14} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-700">{item.label}</span>
                  <ArrowRight
                    size={14}
                    className="shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

"use client";

// The two pieces of structure the Data sources tab needs beyond the cards
// themselves.
//
// `ConnectedSource` collapses a healthy source to one line. Nothing is removed:
// the full IntegrationCard — account picker, Save, Refresh now, Disconnect — is
// passed in as children and rendered the moment the row is opened. A source
// that is working needs no controls on screen by default, and a client with ten
// of them was otherwise ten screens of identical dropdowns to scroll past
// before reaching the one that needed attention. Sources that DO need attention
// are never collapsed; they render as plain cards above this group.
//
// `AvailableIntegrations` is the third section: what could be connected next,
// as a short grid rather than the full catalogue. Each tile is a real link into
// the same consent screen the cards and the modal use.
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { integrationIcon, integrationTint } from "@/components/integrationVisuals";

export function ConnectedSource({
  name,
  icon,
  accent,
  accountLabel,
  lastSyncedAt,
  children,
}: {
  name: string;
  icon: string;
  accent: string;
  /** The chosen account/property, when the provider exposes one. */
  accountLabel: string | null;
  lastSyncedAt: string | null;
  /** The full IntegrationCard for this source. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const Icon = integrationIcon(icon);
  const tint = integrationTint(accent);
  const id = `source-${name.replace(/\W/g, "")}`;

  return (
    <div className="rounded-xl border border-ink-200 bg-surface shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-surface-subtle"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <Icon size={17} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink-900">{name}</span>
          <span className="block truncate text-xs text-ink-500">
            {accountLabel ?? "Connected"}
            {lastSyncedAt ? ` · synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}` : " · not synced yet"}
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-ink-500">{open ? "Hide" : "Manage"}</span>
        <ChevronDown
          size={15}
          aria-hidden
          className={`shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* The card carries its own border, so the wrapper's is dropped when it
          opens rather than drawing a box inside a box. */}
      {open && (
        <div id={id} className="border-t border-ink-100 p-2 [&>div]:border-0 [&>div]:shadow-none">
          {children}
        </div>
      )}
    </div>
  );
}

export type AvailableIntegration = {
  id: string;
  name: string;
  icon: string;
  accent: string;
};

export function AvailableIntegrations({
  clientId,
  integrations,
  totalAvailable,
  browseAction,
}: {
  clientId: string;
  /** The short list actually shown as tiles. */
  integrations: AvailableIntegration[];
  /** How many are connectable in total, for the "browse all" line. */
  totalAvailable: number;
  /** The existing "Add data source" trigger, which opens the full searchable list. */
  browseAction?: React.ReactNode;
}) {
  if (integrations.length === 0) return null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {integrations.map((i) => {
          const Icon = integrationIcon(i.icon);
          const tint = integrationTint(i.accent);
          return (
            <a
              key={i.id}
              // Same consent screen the cards and the modal link to — this is a
              // shortcut into the existing flow, not a second one.
              href={`/dashboard/connect/${i.id}?clientId=${clientId}`}
              className="flex items-center gap-2.5 rounded-xl border border-ink-200 bg-surface px-3 py-2.5 shadow-xs transition-colors hover:border-ink-300 hover:bg-surface-subtle"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}>
                <Icon size={15} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{i.name}</span>
            </a>
          );
        })}
      </div>

      {totalAvailable > integrations.length && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {browseAction}
          <p className="text-xs text-ink-500">
            {totalAvailable - integrations.length} more available — search the full list.
          </p>
        </div>
      )}
    </div>
  );
}

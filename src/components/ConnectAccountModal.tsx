"use client";

// "+ Connect account" affordance for the client Performance section.
//
// This is a shortcut, not a second connection system: picking an integration
// navigates to the SAME consent screen the data-source cards use
// (/dashboard/connect/<type>?clientId=<id>), which then runs the existing OAuth
// or API-key flow untouched. Nothing here talks to a provider directly.
//
// Accessibility mirrors ui/confirm-dialog: portal, backdrop and Escape close,
// focus moves in on open and is restored on close, Tab is trapped.
import * as React from "react";
import { createPortal } from "react-dom";
import { Plus, Search as SearchIcon, X, Check, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Twitter, Youtube, Ghost, Plug, ShoppingBag, FileSpreadsheet, Magnet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { groupForIntegration, GROUP_LABELS, type MetricGroup } from "@/lib/integrations/analyticsViews";

// Discovery is grouped by the SAME metric vocabulary Performance uses
// (lib/integrations/analyticsViews) rather than a second category table — a new
// integration lands in the right section here the moment it's grouped there.
// Paid ads lead: that's what agencies connect first.
const GROUP_ORDER: MetricGroup[] = ["paid", "seo", "analytics", "social", "commerce", "crm", "email", "calls", "other"];

const ICONS: Record<string, typeof SearchIcon> = {
  Search: SearchIcon, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Twitter, Youtube, Ghost, ShoppingBag, FileSpreadsheet, Magnet,
};
const TINTS: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  rose: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
  cyan: "bg-cyan-50 text-cyan-600",
  fuchsia: "bg-fuchsia-50 text-fuchsia-600",
  red: "bg-red-50 text-red-600",
  ink: "bg-ink-100 text-ink-700",
};

// Same alias table as the integrations page search, so "google" finds Search
// Console and "facebook" finds Meta Ads here too.
const ALIASES: Record<string, string> = {
  gsc: "google search console seo organic",
  ga4: "google analytics website traffic",
  gbp: "google business profile maps local",
  google_ads: "google adwords ppc paid search",
  sheets: "google spreadsheet",
  bigquery: "google data warehouse sql",
  youtube_analytics: "google video",
  meta_ads: "facebook instagram paid social",
  instagram: "meta facebook social",
  x_ads: "twitter paid social",
  tiktok_ads: "paid social video",
  pinterest_ads: "paid social",
  snapchat_ads: "paid social",
  linkedin_ads: "b2b paid social",
  microsoft_ads: "bing ppc paid search",
  amazon_ads: "retail media ppc",
  reddit_ads: "paid social",
  shopify: "ecommerce store orders revenue",
  woocommerce: "wordpress ecommerce store",
  stripe: "payments revenue billing",
  hubspot: "crm contacts deals",
  salesforce: "crm contacts deals",
  mailchimp: "email marketing newsletter",
  klaviyo: "email marketing ecommerce",
  activecampaign: "email marketing automation",
  constantcontact: "email marketing",
  campaignmonitor: "email marketing",
  callrail: "call tracking phone",
  ahrefs: "seo backlinks keywords",
  semrush: "seo backlinks keywords",
  moz: "seo domain authority",
  adobe_analytics: "omniture website traffic",
};

export type ConnectableIntegration = {
  id: string;
  name: string;
  description: string;
  icon: string;
  accent: string;
  /** Already connected for this client — offered as a reconnect. */
  connected: boolean;
  /** Built but not yet connectable here. Listed, visibly disabled, never linked. */
  comingSoon?: boolean;
};

export function ConnectAccountButton({
  clientId,
  integrations,
  label = "Connect account",
  variant = "outline",
}: {
  clientId: string;
  integrations: ConnectableIntegration[];
  /** Trigger copy — "Add data source" on the Data sources section. */
  label?: string;
  variant?: "outline" | "default";
}) {
  const [open, setOpen] = React.useState(false);
  if (integrations.length === 0) return null;

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} /> {label}
      </Button>
      {open && <ConnectModal clientId={clientId} integrations={integrations} onClose={() => setOpen(false)} />}
    </>
  );
}

function ConnectModal({
  clientId,
  integrations,
  onClose,
}: {
  clientId: string;
  integrations: ConnectableIntegration[];
  onClose: () => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    return () => prevFocused?.focus?.();
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return integrations;
    const terms = needle.split(/\s+/);
    return integrations.filter((i) => {
      const haystack = `${i.name} ${i.description} ${i.id} ${ALIASES[i.id] ?? ""}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [query, integrations]);

  // Grouped for browsing; a search collapses back to one flat relevance list,
  // since category headers only get in the way once the user has typed.
  const sections = React.useMemo(() => {
    if (query.trim()) return [{ group: null as MetricGroup | null, items: filtered }];
    const byGroup = new Map<MetricGroup, ConnectableIntegration[]>();
    for (const i of filtered) {
      const g = groupForIntegration(i.id);
      const arr = byGroup.get(g) ?? [];
      arr.push(i);
      byGroup.set(g, arr);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({ group: g, items: byGroup.get(g)! }));
  }, [filtered, query]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-ink-900/40 animate-fade-in" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-xl"
      >
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="connect-title" className="text-lg font-semibold text-ink-900">Connect an account</h2>
              <p className="mt-0.5 text-sm text-ink-500">Choose a platform to connect to this client.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-slate-100 hover:text-ink-700"
            >
              <X size={16} />
            </button>
          </div>

          <div className="relative mt-4">
            <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search — Google, Meta, TikTok, LinkedIn…"
              aria-label="Search integrations"
              className="w-full rounded-lg border border-slate-200 bg-surface py-2.5 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        <div className="max-h-[45vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-sm font-medium text-ink-800">No integrations match “{query}”</p>
              <p className="mt-1 text-sm text-ink-500">Try a platform name like Google, Meta, TikTok or Shopify.</p>
            </div>
          ) : (
            sections.map(({ group, items }) => (
              <div key={group ?? "results"} className="mb-1 last:mb-0">
                {group && (
                  <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                    {GROUP_LABELS[group]}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map((i) => {
                    const Icon = ICONS[i.icon] ?? Plug;
                    const tint = TINTS[i.accent] ?? "bg-ink-100 text-ink-600";
                    const body = (
                      <>
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tint}`}>
                          <Icon size={17} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink-900">{i.name}</span>
                          <span className="block truncate text-xs text-ink-500">{i.description}</span>
                        </span>
                        {i.comingSoon ? (
                          <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
                            Coming soon
                          </span>
                        ) : i.connected ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600">
                            <Check size={13} /> Connected
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs font-medium text-brand-600">Connect</span>
                        )}
                      </>
                    );

                    return (
                      <li key={i.id}>
                        {i.comingSoon ? (
                          // Not connectable here — listed for discoverability, never linked.
                          <div className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 opacity-60">{body}</div>
                        ) : (
                          /* A real navigation into the existing consent screen — the
                             same href the data-source cards use. */
                          <a
                            href={`/dashboard/connect/${i.id}?clientId=${clientId}`}
                            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50"
                          >
                            {body}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

"use client";

// Performance section for a client: metric-group tabs, per-source filtering, and
// group-scoped aggregation.
//
// The rule this is built around: metrics are only ever combined INSIDE a group,
// and only where the arithmetic is genuinely valid. Search Console clicks, GA4
// sessions and ad spend count different things, so they are never summed and
// never share a chart. Each group renders its own section; "All" stacks those
// sections rather than merging them.
//
// Paid ads is the one group with a real cross-source total — spend, impressions,
// clicks, conversions and revenue are the same unit on every ad platform. That
// aggregation lives in lib/integrations/blocks.ts (shared with the PDF and AI),
// so this component adds no second data path.
import { useMemo, useState } from "react";
import { ClientAnalytics } from "@/components/ClientAnalytics";
import { aggregatePaidSnapshots, formatBlockValue } from "@/lib/integrations/blocks";
import { GROUP_LABELS, type MetricGroup } from "@/lib/integrations/analyticsViews";

export type PerformanceSource = {
  /** Integration id, e.g. "meta_ads" — selects the right chart view. */
  id: string;
  /** Display name, e.g. "Meta Ads". */
  name: string;
  /** The selected account within that source, when the provider exposes one. */
  accountLabel: string | null;
  /** Metric family this source belongs to; only same-group sources combine. */
  group: MetricGroup;
  snapshot: unknown;
};

const ALL = "__all__";

// Groups render in a consistent, meaningful order rather than connection order.
const GROUP_ORDER: MetricGroup[] = ["paid", "seo", "analytics", "social", "commerce", "crm", "email", "calls", "other"];

export function ClientPerformance({ sources }: { sources: PerformanceSource[] }) {
  const [group, setGroup] = useState<MetricGroup | typeof ALL>(ALL);
  const [source, setSource] = useState<string>(ALL);

  // Which groups actually have data, in display order.
  const groups = useMemo(
    () => GROUP_ORDER.filter((g) => sources.some((s) => s.group === g)),
    [sources]
  );

  // Sources inside the selected group (or all of them).
  const inGroup = useMemo(
    () => (group === ALL ? sources : sources.filter((s) => s.group === group)),
    [sources, group]
  );

  // Cross-platform paid total, scoped to whatever is currently visible so it
  // always matches the blocks beneath it.
  const visibleSources = source === ALL ? inGroup : inGroup.filter((s) => s.id === source);
  const paidAggregate = useMemo(
    () => aggregatePaidSnapshots(visibleSources.filter((s) => s.group === "paid").map((s) => ({ type: s.id, snapshot: s.snapshot }))),
    [visibleSources]
  );

  if (sources.length === 0) return null;

  const selectGroup = (g: MetricGroup | typeof ALL) => {
    setGroup(g);
    setSource(ALL); // a group change resets the source filter to that group's "all"
  };

  // Groups to render as sections. A specific source selection collapses to its
  // own group only.
  const renderGroups = group === ALL ? groups : [group];

  return (
    <div>
      {/* Level 1 — metric group. Only shown when there's more than one. */}
      {groups.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Pill active={group === ALL} onClick={() => selectGroup(ALL)}>All</Pill>
          {groups.map((g) => (
            <Pill key={g} active={group === g} onClick={() => selectGroup(g)}>
              {GROUP_LABELS[g]}
              <span className="ml-1.5 opacity-60">{sources.filter((s) => s.group === g).length}</span>
            </Pill>
          ))}
        </div>
      )}

      {/* Level 2 — individual source within the current group. */}
      {inGroup.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Pill small active={source === ALL} onClick={() => setSource(ALL)}>
            {group === ALL ? "All sources" : `All ${GROUP_LABELS[group].toLowerCase()} sources`}
          </Pill>
          {inGroup.map((s) => (
            <Pill key={s.id} small active={source === s.id} onClick={() => setSource(s.id)}>
              {s.name}
              {s.accountLabel ? <span className="ml-1.5 opacity-60">{s.accountLabel}</span> : null}
            </Pill>
          ))}
        </div>
      )}

      <div className="space-y-12">
        {renderGroups.map((g) => {
          const groupSources = visibleSources.filter((s) => s.group === g);
          if (groupSources.length === 0) return null;

          return (
            <section key={g}>
              {/* Group heading only earns its place when more than one group shows. */}
              {renderGroups.length > 1 && (
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  {GROUP_LABELS[g]}
                </h3>
              )}

              {/* Real cross-platform total — paid media only. */}
              {g === "paid" && paidAggregate && (
                <div className="mb-6 rounded-xl border border-slate-200 bg-surface p-5">
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="text-sm font-semibold text-ink-900">Combined paid media</h4>
                    <p className="text-xs text-ink-500">{paidAggregate.sourceNames.join(" · ")}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    {paidAggregate.currency && (
                      <Metric label="Spend" value={formatBlockValue(paidAggregate.spend, "currency", paidAggregate.currency)} />
                    )}
                    <Metric label="Impressions" value={formatBlockValue(paidAggregate.impressions, "number")} />
                    <Metric label="Clicks" value={formatBlockValue(paidAggregate.clicks, "number")} />
                    <Metric label="CTR" value={formatBlockValue(paidAggregate.ctr, "percent")} />
                    {paidAggregate.currency && (
                      <Metric label="CPC" value={formatBlockValue(paidAggregate.cpc, "currency", paidAggregate.currency)} />
                    )}
                    <Metric label="Conversions" value={formatBlockValue(paidAggregate.conversions, "number")} />
                    {paidAggregate.currency && paidAggregate.revenue > 0 && (
                      <Metric label="Revenue" value={formatBlockValue(paidAggregate.revenue, "currency", paidAggregate.currency)} />
                    )}
                    {paidAggregate.roas > 0 && (
                      <Metric label="ROAS" value={`${paidAggregate.roas.toFixed(2)}×`} />
                    )}
                  </div>

                  {!paidAggregate.currency && (
                    <p className="mt-4 text-xs text-ink-500">
                      These ad accounts report in different currencies (or one didn&apos;t report a currency), so spend
                      and cost metrics aren&apos;t combined. Select a single platform above to see its spend.
                    </p>
                  )}
                </div>
              )}

              {/* SEO tools measure the same domain by different methods, so their
                  figures are shown side by side and never added together. */}
              {g === "seo" && groupSources.length > 1 && (
                <p className="mb-4 text-xs text-ink-500">
                  Search Console reports measured search data; SEO tools report their own estimates. They describe the
                  same site in different ways, so each is shown separately rather than combined.
                </p>
              )}

              <div className="space-y-10">
                {groupSources.map((s) => (
                  <div key={s.id}>
                    <h4 className="mb-3 text-sm font-medium text-ink-700">
                      {s.name}
                      {s.accountLabel ? <span className="ml-2 font-normal text-ink-500">{s.accountLabel}</span> : null}
                    </h4>
                    <ClientAnalytics id={s.id} snapshot={s.snapshot} />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Pill({
  active, onClick, small, children,
}: {
  active: boolean; onClick: () => void; small?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border transition-colors ${small ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-sm"} ${
        active
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-slate-200 bg-surface text-ink-600 hover:border-slate-300 hover:text-ink-900"
      }`}
    >
      {children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight text-ink-900">{value}</p>
    </div>
  );
}

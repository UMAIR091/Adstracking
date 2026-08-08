"use client";

// Account switcher for the client Performance section.
//
// "All accounts" shows every connected source's own chart block, plus a combined
// paid-media summary when more than one ad platform is connected. Selecting a
// single account narrows the view to just that source.
//
// The combined summary deliberately covers paid media only: spend, impressions,
// clicks and conversions are the same unit on every ad platform, so they add up.
// Search Console clicks and GA4 sessions measure different things and are never
// merged — each keeps its own block. Aggregation itself lives in
// lib/integrations/blocks.ts, reusing the same projection the PDF and AI use, so
// there is no second data path.
import { useMemo, useState } from "react";
import { ClientAnalytics } from "@/components/ClientAnalytics";
import { aggregatePaidSnapshots, formatBlockValue } from "@/lib/integrations/blocks";

export type PerformanceSource = {
  /** Integration id, e.g. "meta_ads" — selects the right chart view. */
  id: string;
  /** Display name, e.g. "Meta Ads". */
  name: string;
  /** The selected account within that source, when the provider exposes one. */
  accountLabel: string | null;
  snapshot: unknown;
};

const ALL = "__all__";

export function ClientPerformance({ sources }: { sources: PerformanceSource[] }) {
  const [selected, setSelected] = useState<string>(ALL);

  // Recomputed only when the snapshots change, not on every re-render.
  const combined = useMemo(
    () => aggregatePaidSnapshots(sources.map((s) => ({ type: s.id, snapshot: s.snapshot }))),
    [sources]
  );

  if (sources.length === 0) return null;

  const visible = selected === ALL ? sources : sources.filter((s) => s.id === selected);
  // A lone source needs no switcher — the label would just restate the heading.
  const showSwitcher = sources.length > 1;

  return (
    <div>
      {showSwitcher && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Pill active={selected === ALL} onClick={() => setSelected(ALL)}>
            All accounts
          </Pill>
          {sources.map((s) => (
            <Pill key={s.id} active={selected === s.id} onClick={() => setSelected(s.id)}>
              {s.name}
              {s.accountLabel ? <span className="ml-1.5 opacity-60">{s.accountLabel}</span> : null}
            </Pill>
          ))}
        </div>
      )}

      {selected === ALL && combined && (
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink-900">Combined paid media</h3>
            <p className="text-xs text-ink-500">{combined.sourceNames.join(" · ")}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {combined.currency && (
              <Metric label="Spend" value={formatBlockValue(combined.spend, "currency", combined.currency)} />
            )}
            <Metric label="Impressions" value={formatBlockValue(combined.impressions, "number")} />
            <Metric label="Clicks" value={formatBlockValue(combined.clicks, "number")} />
            <Metric label="CTR" value={formatBlockValue(combined.ctr, "percent")} />
            {combined.currency && (
              <Metric label="CPC" value={formatBlockValue(combined.cpc, "currency", combined.currency)} />
            )}
            <Metric label="Conversions" value={formatBlockValue(combined.conversions, "number")} />
          </div>

          {!combined.currency && (
            <p className="mt-4 text-xs text-ink-500">
              These accounts report in different currencies, so spend and cost metrics aren&apos;t combined.
              Select an account above to see its spend.
            </p>
          )}
        </div>
      )}

      <div className="space-y-10">
        {visible.map((s) => (
          <div key={s.id}>
            <h3 className="mb-3 text-sm font-medium text-ink-700">
              {s.name}
              {s.accountLabel ? <span className="ml-2 font-normal text-ink-500">{s.accountLabel}</span> : null}
            </h3>
            <ClientAnalytics id={s.id} snapshot={s.snapshot} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-slate-200 bg-white text-ink-600 hover:border-slate-300 hover:text-ink-900"
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

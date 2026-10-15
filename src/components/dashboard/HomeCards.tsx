import Link from "next/link";
import { MiniSpark } from "@/components/ui/mini-spark";
import { StatusChip } from "@/components/ui/status-chip";
import type { ClientStatus } from "@/lib/dashboard/clientStatus";

// Home's cards. Server components fed only by values app/dashboard/page.tsx
// already computes; anything not available renders "—" rather than a guess.

const card = "rounded-card border border-ink-200 bg-surface";

/* ── Search performance ───────────────────────────────────── */

export function SearchPerformance({
  clicks, impressions, ctr, position, deltaPct, good, comparison, series,
}: {
  clicks: string;
  impressions: string;
  ctr: string;
  position: string;
  deltaPct: number | null;
  good: boolean;
  comparison: string;
  series: number[];
}) {
  return (
    <section aria-labelledby="perf-heading" className={`${card} px-[18px] py-4`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="perf-heading" className="text-[15px] font-semibold text-ink-900">Search performance</h2>
        <span className="text-xs text-ink-400">All clients · 28 days</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[12.5px] text-ink-400">Clicks</p>
          <p className="text-[26px] font-semibold tracking-[-0.03em] tabular-nums text-ink-900">{clicks}</p>
          {deltaPct !== null && (
            <p className={`text-[12.5px] font-medium ${good ? "text-success-700" : "text-danger-700"}`}>
              {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}% {comparison}
            </p>
          )}
        </div>
        <MiniSpark values={series} width={120} height={44} area />
      </div>
      <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3">
        {[
          ["Impressions", impressions],
          ["Avg CTR", ctr],
          ["Avg position", position],
        ].map(([l, v]) => (
          <div key={l}>
            <dt className="text-[11.5px] text-ink-400">{l}</dt>
            <dd className="text-[14.5px] font-semibold tabular-nums text-ink-900">{v}</dd>
          </div>
        ))}
      </dl>
      <Link href="/dashboard/clients" className="mt-3 inline-block text-[13px] font-medium text-brand-600 hover:text-ink-900">
        Per-client detail →
      </Link>
    </section>
  );
}

/* ── Clients table ────────────────────────────────────────── */

export type HomeClientRow = {
  id: string;
  name: string;
  logoUrl: string | null;
  sourceCount: number;
  status: ClientStatus;
  lastReport: string | null;
  nextDelivery: string | null;
};

export function ClientMonogram({ name, logoUrl, size = 28 }: { name: string; logoUrl: string | null; size?: number }) {
  if (logoUrl) {
    return (
      <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-surface" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" decoding="async" className="max-h-full max-w-full object-contain p-0.5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-lg bg-ink-900 font-bold text-surface"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.43) }}
    >
      {(name || "C").charAt(0).toUpperCase()}
    </span>
  );
}

const ROW_GRID = "grid grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] items-center gap-3";

export function HomeClients({ rows, total }: { rows: HomeClientRow[]; total: number }) {
  return (
    <section aria-labelledby="home-clients-heading" className={`overflow-hidden ${card}`}>
      <div className="flex items-center justify-between px-[18px] py-3.5">
        <h2 id="home-clients-heading" className="text-[15px] font-semibold text-ink-900">Clients</h2>
        <Link href="/dashboard/clients" className="text-[13px] font-medium text-brand-600 hover:text-ink-900">
          View all {total}
        </Link>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div aria-hidden className={`${ROW_GRID} border-y border-ink-100 bg-ink-50 px-[18px] py-2 text-xs text-ink-400`}>
            <span>Client</span>
            <span>Status</span>
            <span>Last report</span>
            <span>Next delivery</span>
          </div>
          <ul>
            {rows.map((c) => (
              <li key={c.id} className="border-b border-ink-100 last:border-b-0">
                <Link href={`/dashboard/clients/${c.id}`} className={`${ROW_GRID} px-[18px] py-3 text-[13.5px] transition-colors hover:bg-ink-50`}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ClientMonogram name={c.name} logoUrl={c.logoUrl} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink-900">{c.name}</span>
                      <span className="block text-xs text-ink-400">
                        {c.sourceCount ? `${c.sourceCount} source${c.sourceCount === 1 ? "" : "s"}` : "No sources"}
                      </span>
                    </span>
                  </span>
                  <span><StatusChip tone={c.status.tone}>{c.status.label}</StatusChip></span>
                  <span className="text-ink-500"><span className="sr-only">Last report: </span>{c.lastReport ?? "—"}</span>
                  <span className="text-ink-500"><span className="sr-only">Next delivery: </span>{c.nextDelivery ?? "—"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ── New workspace ────────────────────────────────────────── */

export function SampleReportCard({ agencyName, brandColor }: { agencyName: string; brandColor: string | null }) {
  const color = brandColor || "#0F7A6C";
  return (
    <section aria-labelledby="sample-heading" className="rounded-2xl border border-nav-line bg-nav-bg p-5 text-nav-mark">
      <p className="font-app-mono text-[11px] uppercase tracking-[0.08em] text-report-verdict-accent">Before you connect anything</p>
      <h3 id="sample-heading" className="mt-2.5 text-lg font-semibold tracking-[-0.02em] text-nav-strong">See what your clients will receive</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-site-dark-muted">
        A fully rendered sample report — cover, charts, AI summary — in your logo and colours.
      </p>
      <div aria-hidden className="relative mt-3.5 overflow-hidden rounded-[10px] bg-white p-3 text-[#12171C]">
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
        <div className="mt-1 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-[5px] text-[10px] font-bold text-white" style={{ background: color }}>
            {(agencyName || "A").charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-xs font-semibold">{agencyName}</span>
        </div>
        <p className="mt-2.5 text-[13px] font-semibold">Monthly Performance Report</p>
        <div className="mt-2 flex gap-1">
          <span className="h-[22px] flex-1 rounded-[5px] bg-[#F6F5F2]" />
          <span className="h-[22px] flex-1 rounded-[5px] bg-[#F6F5F2]" />
          <span className="h-[22px] flex-1 rounded-[5px] bg-[#F6F5F2]" />
        </div>
      </div>
      <Link
        href="/dashboard/reports/preview"
        className="mt-3.5 inline-flex rounded-control bg-nav-electric px-3.5 py-[9px] text-[13.5px] font-semibold text-report-verdict transition-opacity hover:opacity-90 [--ring:var(--nav-electric)]"
      >
        Open sample report
      </Link>
    </section>
  );
}

export function BrandingCard() {
  return (
    <section aria-labelledby="brand-card-heading" className="rounded-2xl border border-ink-200 bg-surface px-5 py-[18px]">
      <h3 id="brand-card-heading" className="text-[15px] font-semibold text-ink-900">Your brand, not ours</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">
        Clients see your logo and colour on every report and email. Add them now and your first report is white-label
        from day one.
      </p>
      <Link href="/dashboard/settings" className="mt-3 inline-flex text-[13.5px] font-medium text-brand-600 hover:text-ink-900">
        Set up branding →
      </Link>
    </section>
  );
}

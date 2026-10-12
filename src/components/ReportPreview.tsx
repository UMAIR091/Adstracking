"use client";

import { buildVerdict } from "@/lib/reports/verdict";
import { VerdictPanel } from "@/components/VerdictPanel";
import type { GscReportFull } from "@/lib/google";
import {
  CHART, Callout, EdgeKeywords, KpiCard, NotePanel, PositionChip, ReportBody, ReportCover, ReportFooter,
  ReportPaper, Section, StepList, StepRow, T, TileGrid, TrendCard, brandTones, type GlanceCell,
} from "@/components/report/ui";

type Branding = { name: string; logo_url: string | null; brand_color: string; website: string | null; footer_text: string | null };

const fmt = (n: number) => n.toLocaleString();

// ─── Realistic sample SEO data (28-day period for a fictional client) ───────
const days = Array.from({ length: 28 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (27 - i));
  const clicks = Math.round(380 + 150 * Math.sin(i / 3.2) + i * 9);
  const impressions = Math.round(clicks * (18 + (i % 6)));
  return {
    date: d.toISOString().slice(5, 10),
    clicks,
    impressions,
    position: +(12.4 - i * 0.11 + Math.sin(i / 2) * 0.5).toFixed(1),
  };
});
const totalClicks = days.reduce((s, d) => s + d.clicks, 0);
const totalImpr = days.reduce((s, d) => s + d.impressions, 0);

const kpis = [
  { label: "Clicks", value: fmt(totalClicks), delta: 18.4, good: true, color: "#4f46e5" },
  { label: "Impressions", value: fmt(totalImpr), delta: 12.1, good: true, color: "#0ea5e9" },
  { label: "Avg CTR", value: "4.7%", delta: 5.6, good: true, color: "#10b981" },
  { label: "Avg Position", value: "9.8", delta: -13.2, good: true, color: "#f59e0b" }, // lower is better
];

const topQueries = [
  { q: "running shoes for marathon", clicks: 1240, impr: 18400, ctr: 6.7, pos: 2.3 },
  { q: "best trail running shoes", clicks: 980, impr: 15200, ctr: 6.4, pos: 3.1 },
  { q: "carbon plate running shoes", clicks: 760, impr: 12800, ctr: 5.9, pos: 4.8 },
  { q: "marathon training plan", clicks: 640, impr: 9900, ctr: 6.5, pos: 3.6 },
  { q: "running shoe size guide", clicks: 520, impr: 8700, ctr: 6.0, pos: 5.2 },
  { q: "trail vs road running shoes", clicks: 410, impr: 7300, ctr: 5.6, pos: 6.9 },
  { q: "best running socks", clicks: 360, impr: 6800, ctr: 5.3, pos: 7.4 },
];

const winners = [
  { q: "carbon plate running shoes", growth: 142, pos: 4.8, from: 9.2 },
  { q: "marathon recovery shoes", growth: 98, pos: 7.1, from: 13.6 },
  { q: "wide toe box running shoes", growth: 76, pos: 8.4, from: 12.1 },
  { q: "best running shoes 2026", growth: 64, pos: 5.6, from: 8.9 },
];

const decliners = [
  { q: "cheap running shoes", drop: 38, pos: 12.4, from: 8.1 },
  { q: "running shoes sale", drop: 24, pos: 14.2, from: 10.5 },
  { q: "minimalist running shoes", drop: 19, pos: 11.8, from: 9.3 },
];

const opportunities = [
  { q: "running shoes for beginners", pos: 10.8, impr: 8200 },
  { q: "stability running shoes", pos: 11.2, impr: 9800 },
  { q: "running shoes for flat feet", pos: 12.6, impr: 7400 },
  { q: "long distance running shoes", pos: 13.1, impr: 6900 },
];

const recommendations = [
  { priority: "High", text: "Refresh the “carbon plate running shoes” guide and add internal links to push it from position 4.8 into the top 3." },
  { priority: "High", text: "Build a dedicated “running shoes for beginners” page — it sits at position 10.8 with 8,200 monthly impressions, just outside page one." },
  { priority: "Medium", text: "Improve titles & meta descriptions on high-impression, lower-CTR pages to convert more of the growing impression base." },
  { priority: "Medium", text: "Investigate the drop on “cheap running shoes” (down 38%) — likely a SERP layout or intent shift; consider a comparison angle." },
];

const actionPlan = [
  "Publish the new “running shoes for beginners” landing page (target: page one).",
  "Update on-page content and internal links for the top 3 winning keywords.",
  "Run a title/meta refresh on the 10 highest-impression pages.",
  "Audit declining keywords and ship fixes for the top 2.",
];

// The sample verdict is produced by the real builder rather than written by
// hand, so the marketing page can never advertise a panel the product does not
// actually generate. Fed from the same sample totals the rest of this preview
// renders, with the previous period implied by the +18.4% shown on the KPI row.
const sampleGsc = {
  totals: { clicks: totalClicks, impressions: totalImpr, ctr: 0.047, position: 9.8 },
  previousTotals: {
    clicks: Math.round(totalClicks / 1.184),
    impressions: Math.round(totalImpr / 1.121),
    ctr: 0.0445,
    position: 11.3,
  },
  topQueries: [], topPages: [], topCountries: [], topDevices: [], byDate: [], movers: null,
} as unknown as GscReportFull;

export function ReportPreview({ branding }: { branding: Branding }) {
  const color = branding.brand_color || "#4f46e5";
  const brand = brandTones(color);

  // "Last 28 days" is not a calendar month, so the headline correctly reads
  // "This period" rather than naming one.
  const verdict = buildVerdict({
    period: { start: "", end: "" },
    gsc: sampleGsc, ga4: null, blocks: [],
    watch: { action: actionPlan[0], because: "" },
  });

  // At a glance, by the live report's rule for a Search Console-only report:
  // search clicks and average position, each from the sample totals above.
  const posSpots = sampleGsc.previousTotals!.position - sampleGsc.totals.position;
  const glance: GlanceCell[] = [
    { label: "Search clicks", value: fmt(totalClicks), delta: { text: `▲ ${kpis[0].delta.toFixed(0)}%`, good: true } },
    { label: "Avg Position", value: sampleGsc.totals.position.toFixed(1), delta: { text: `▲ ${posSpots.toFixed(1)} spots`, good: true } },
  ];

  const sparks: Record<string, number[]> = {
    Clicks: days.map((d) => d.clicks),
    Impressions: days.map((d) => d.impressions),
    "Avg Position": days.map((d) => -d.position),
  };

  return (
    // Same rule as ReportDocument: the preview shows the deliverable, so it
    // keeps the light palette whatever the surrounding app is set to.
    <ReportPaper>
      <ReportCover
        brand={brand}
        agencyName={branding.name}
        agencyLogoUrl={branding.logo_url}
        agencyWebsite={branding.website}
        badge="SEO Report"
        title="Organic Search Performance"
        clientName="Acme Running Co"
        meta={["Last 28 days"]}
        glance={glance}
      />

      <ReportBody>
        {/* The thirty-second answer, above every numbered section. */}
        {verdict && <VerdictPanel v={verdict} color={color} />}

        {/* 1 ── Executive Summary ── */}
        <Section n={1} title="Executive Summary" subtitle="Performance at a glance" brand={brand}>
          <p className="max-w-[680px] text-[16.5px] leading-[1.7] text-report-body [text-wrap:pretty]">
            Organic search had a <strong className="font-semibold text-report-ink">strong month</strong>. Clicks grew{" "}
            <strong className="font-semibold text-report-good">+18.4%</strong> and impressions{" "}
            <strong className="font-semibold text-report-good">+12.1%</strong>, while average position improved from 11.4 to{" "}
            <strong className="font-semibold text-report-ink">9.8</strong>. Growth was led by high-intent product terms — “carbon plate running shoes” more than doubled its traffic — though a few budget-oriented keywords softened.
          </p>
          <TileGrid min={200} className="mt-5">
            <Callout tone="good" title="Key win" text="“Carbon plate running shoes” up 142%, now position 4.8." />
            <Callout tone="bad" title="Watch" text="“Cheap running shoes” down 38% — intent shift on the SERP." />
            <Callout tone="watch" title="Trend" text="Visibility rising — 4 keywords are one step from page one." />
          </TileGrid>
        </Section>

        {/* 2 ── KPI Overview ── */}
        <Section n={2} title="KPI Overview" subtitle="Period-over-period vs. the prior 28 days" brand={brand}>
          <TileGrid min={150}>
            {kpis.map((m) => (
              <KpiCard
                key={m.label}
                label={m.label}
                value={m.value}
                delta={{ text: `${m.delta >= 0 ? "▲" : "▼"} ${Math.abs(m.delta).toFixed(1)}%`, good: m.good }}
                spark={sparks[m.label] ?? null}
                brand={brand}
              />
            ))}
          </TileGrid>
        </Section>

        {/* 3 ── Traffic & Visibility Trends ── */}
        <Section n={3} title="Traffic & Visibility Trends" subtitle="Daily clicks, impressions and ranking" brand={brand}>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
            <TrendCard
              title="Clicks & impressions"
              total={fmt(totalClicks)}
              delta={{ text: `▲ ${kpis[0].delta.toFixed(1)}%`, good: true }}
              data={days}
              dataKey="clicks"
              color={brand.color}
            />
            <TrendCard
              title="Average position (lower is better)"
              total="9.8"
              delta={{ text: `▲ ${posSpots.toFixed(1)} spots`, good: true }}
              data={days}
              dataKey="position"
              color={CHART.position}
              reversed
            />
          </div>
          <p className="mt-3.5 text-[13.5px] leading-[1.55] text-report-muted">Traffic is trending up steadily through the period, and average position has improved roughly two spots — a sign of compounding ranking gains.</p>
        </Section>

        {/* 4 ── Top Performing Queries ── */}
        <Section n={4} title="Top Performing Queries" subtitle="Your biggest traffic drivers" brand={brand}>
          <div className={T.wrap}>
            <table className={`${T.table} min-w-[520px]`}>
              <thead>
                <tr className={T.headRow}>
                  {/* The query gets the room; the four figures are short. */}
                  <th className={`${T.th} w-[46%]`}>Query</th>
                  <th className={T.thNum}>Clicks</th>
                  <th className={T.thNum}>Impr.</th>
                  <th className={T.thNum}>CTR</th>
                  <th className={T.thNum}>Pos.</th>
                </tr>
              </thead>
              <tbody>
                {topQueries.map((q) => (
                  <tr key={q.q} className={T.row}>
                    <td className={`${T.td} max-w-0 truncate font-medium`}>{q.q}</td>
                    <td className={`${T.tdNum} font-semibold`}>{fmt(q.clicks)}</td>
                    <td className={`${T.tdNum} text-report-meta`}>{fmt(q.impr)}</td>
                    <td className={`${T.tdNum} text-report-meta`}>{q.ctr}%</td>
                    <td className={T.tdNum}><PositionChip position={q.pos} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 5 & 6 ── Winning / Declining Keywords ── */}
        <div className="grid gap-x-6 gap-y-14 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
          <Section n={5} title="Winning Keywords" subtitle="Strongest growth this period" brand={brand}>
            <MoverList
              good
              rows={winners.map((k) => ({ key: k.q, sub: `Position ${k.from} → ${k.pos}`, pct: k.growth }))}
            />
          </Section>

          <Section n={6} title="Declining Keywords" subtitle="Losing traffic or rankings" brand={brand}>
            <MoverList
              good={false}
              rows={decliners.map((k) => ({ key: k.q, sub: `Position ${k.from} → ${k.pos}`, pct: k.drop }))}
            />
          </Section>
        </div>

        {/* 7 ── Growth Opportunities ── */}
        <Section n={7} title="Growth Opportunities" subtitle="Keywords on the edge of page one — quick wins" brand={brand}>
          <EdgeKeywords rows={opportunities.map((o) => ({ key: o.q, impressions: o.impr, position: o.pos }))} brand={brand} />
        </Section>

        {/* 8 ── AI Insights ── */}
        <Section n={8} title="AI Insights" subtitle="Automated analysis of what matters" brand={brand}>
          <div className="rounded-[14px] p-5" style={{ background: brand.soft }}>
            <p className="font-report-mono text-[11px] uppercase tracking-[0.06em]" style={{ color: brand.ink }}>AI summary</p>
            <p className="mt-2 text-[15px] leading-[1.6] text-report-body">
              The account is in a healthy growth phase: rising impressions paired with improving CTR show your content is matching demand, not just appearing more often. Momentum is concentrated in premium product terms, which tend to convert well. The main risk is over-reliance on a few head terms — diversifying into the four near-page-one opportunities would broaden the traffic base and reduce volatility.
            </p>
          </div>
        </Section>

        {/* 9 ── Recommended Actions ── */}
        <Section n={9} title="Recommended Actions" subtitle="Prioritised for impact" brand={brand}>
          <StepList>
            {recommendations.map((r, i) => (
              <StepRow key={i} n={i + 1} brand={brand} action={r.text} priority={`${r.priority} priority`} />
            ))}
          </StepList>
        </Section>

        {/* 10 ── Next Month Action Plan ── */}
        <Section n={10} title="Next Month Action Plan" subtitle="What we'll execute next" brand={brand}>
          <StepList>
            {actionPlan.map((a, i) => (
              <StepRow key={i} n={i + 1} brand={brand} action={a} />
            ))}
          </StepList>
        </Section>

        {/* 11 ── Agency Notes ── */}
        <Section n={11} title="Agency Notes" subtitle="A personal note from your team" brand={brand}>
          <NotePanel brand={brand} agencyName={branding.name} agencyLogoUrl={branding.logo_url}>
            <p>
              “Great momentum this month, team. We&apos;re especially pleased with the carbon-plate category breaking into the top five — that aligns directly with the Q3 product push. Next month we&apos;ll focus on the beginner audience to widen the funnel. As always, reach out any time with questions.”
            </p>
          </NotePanel>
        </Section>

        <ReportFooter left={branding.footer_text || `Prepared by ${branding.name || "Your Agency"}`} right={branding.website} />
      </ReportBody>
    </ReportPaper>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// The sample keeps its winning and declining keywords as two numbered
// sections, so each list is one tinted panel without a repeated title.
function MoverList({ rows, good }: { rows: { key: string; sub: string; pct: number }[]; good: boolean }) {
  return (
    <ul className={`rounded-[14px] px-4 py-2 ${good ? "bg-report-good-soft" : "bg-report-bad-soft"}`}>
      {rows.map((k) => (
        <li key={k.key} className={`flex justify-between gap-3 border-t py-2.5 text-sm first:border-t-0 ${good ? "border-report-good-line" : "border-report-bad-line"}`}>
          <span className="min-w-0">
            <span className="block truncate font-medium">{k.key}</span>
            <span className="block text-[11.5px] text-report-meta">{k.sub}</span>
          </span>
          <span className={`shrink-0 whitespace-nowrap font-semibold ${good ? "text-report-good" : "text-report-bad"}`}>
            {good ? "▲" : "▼"} {Math.abs(k.pct)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

// Server-side premium white-label PDF generation for reports. Uses
// @react-pdf/renderer (no headless browser) so it runs on Vercel serverless.
// Renders the unified GSC + GA4 report into a branded, multi-page PDF with a
// cover page, running header/footer, page numbers, generation date, KPIs,
// native vector charts, tables and AI insights.
import React from "react";
import { Document, Page, View, Text, StyleSheet, Svg, Path, Polyline, Rect, renderToBuffer } from "@react-pdf/renderer";
import { normalizeReportData } from "@/lib/report";

type Branding = {
  name: string;
  brand_color: string;
  website: string | null;
  footer_text: string | null;
  contact_email?: string | null;
};

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;
const safeColor = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#4f46e5");

function shade(hex: string): string {
  try {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, ((n >> 16) & 255) - 40);
    const g = Math.max(0, ((n >> 8) & 255) - 40);
    const b = Math.max(0, (n & 255) - 40);
    return `rgb(${r},${g},${b})`;
  } catch {
    return hex;
  }
}

function pagePathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname || "/") + (u.search || "");
  } catch {
    return url;
  }
}

function deltaPct(cur: number, prev: number | null | undefined): number | null {
  if (prev == null || prev === 0) return null;
  const p = ((cur - prev) / prev) * 100;
  return isFinite(p) ? p : null;
}

function makeStyles(color: string) {
  return StyleSheet.create({
    coverPage: { backgroundColor: color, color: "#ffffff", padding: 0 },
    coverInner: { flex: 1, paddingHorizontal: 48, paddingVertical: 56, justifyContent: "space-between" },
    coverTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    logoBox: { width: 40, height: 40, borderRadius: 6, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
    logoLetter: { fontSize: 20, fontFamily: "Helvetica-Bold", color },
    agencyName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#ffffff" },
    badge: { alignSelf: "flex-start", borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 12, paddingVertical: 5, fontSize: 9, marginBottom: 14 },
    coverTitle: { fontSize: 30, fontFamily: "Helvetica-Bold", color: "#ffffff", lineHeight: 1.15 },
    coverMeta: { fontSize: 12, color: "#e6e9f5", marginTop: 12 },
    coverDetails: { fontSize: 10, color: "#dfe3f3", marginTop: 4 },

    page: { paddingTop: 60, paddingBottom: 54, paddingHorizontal: 40, fontSize: 10, color: "#334155", fontFamily: "Helvetica" },
    header: { position: "absolute", top: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: "1pt solid #e9edf2", paddingBottom: 8 },
    headerAgency: { fontSize: 10, fontFamily: "Helvetica-Bold", color },
    headerMeta: { fontSize: 8, color: "#94a3b8" },
    footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTop: "1pt solid #eef1f5", paddingTop: 8, fontSize: 8, color: "#94a3b8" },

    section: { marginBottom: 18 },
    h2: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#0f172a", marginBottom: 8 },
    para: { fontSize: 10, lineHeight: 1.5, color: "#334155" },
    groupLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color, marginTop: 6, marginBottom: 5 },
    kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    kpi: { width: "23%", border: "1pt solid #e9edf2", borderRadius: 6, padding: 8 },
    kpiLabel: { fontSize: 8, color: "#64748b" },
    kpiValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color, marginTop: 3 },
    kpiDelta: { fontSize: 7.5, marginTop: 2 },
    up: { color: "#059669" },
    down: { color: "#e11d48" },

    chartLabel: { fontSize: 8, color: "#64748b", marginBottom: 4 },
    chartWrap: { flexDirection: "row", gap: 14 },
    chartCol: { flex: 1 },

    tableHeader: { flexDirection: "row", borderBottom: "1pt solid #e9edf2", paddingBottom: 4, marginBottom: 2 },
    row: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.5pt solid #f1f5f9" },
    th: { fontSize: 8, color: "#94a3b8", fontFamily: "Helvetica-Bold" },
    td: { fontSize: 9, color: "#334155" },

    bullet: { flexDirection: "row", marginBottom: 4 },
    bulletDot: { width: 10, fontSize: 10, color },
    bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.4 },
    twoCol: { flexDirection: "row", gap: 16 },
    col: { flex: 1 },
  });
}

type S = ReturnType<typeof makeStyles>;

// ── Native vector charts ─────────────────────────────────────────────────────
function LineChart({ values, color, width = 230, height = 70, reversed = false }: { values: number[]; color: string; width?: number; height?: number; reversed?: boolean }) {
  if (values.length < 2) return <Svg width={width} height={height} />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const y = (v: number) => {
    const t = (v - min) / range;
    return reversed ? t * (height - 4) + 2 : (height - 4) - t * (height - 4) + 2;
  };
  const coords = values.map((v, i) => [i * stepX, y(v)] as const);
  const points = coords.map(([x, yy]) => `${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  const area = `M0,${height} ` + coords.map(([x, yy]) => `L${x.toFixed(1)},${yy.toFixed(1)}`).join(" ") + ` L${width},${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Path d={area} fill={color} fillOpacity={0.12} />
      <Polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

function BarChart({ rows, color, width = 230 }: { rows: { label: string; value: number }[]; color: string; width?: number }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const barH = 12;
  const gap = 6;
  const labelW = 0; // labels rendered outside in the table
  const height = rows.length * (barH + gap);
  return (
    <Svg width={width} height={height}>
      {rows.map((r, i) => {
        const w = Math.max(2, ((width - labelW) * r.value) / max);
        return <Rect key={i} x={0} y={i * (barH + gap)} width={w} height={barH} rx={2} fill={color} />;
      })}
    </Svg>
  );
}

function Kpi({ label, value, delta, lowerBetter, s }: { label: string; value: string; delta: number | null; lowerBetter?: boolean; s: S }) {
  const good = delta == null ? false : lowerBetter ? delta < 0 : delta > 0;
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {delta != null && (
        <Text style={[s.kpiDelta, good ? s.up : s.down]}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%</Text>
      )}
    </View>
  );
}

function Bullets({ items, s }: { items: string[]; s: S }) {
  return (
    <View>
      {items.map((it, i) => (
        <View key={i} style={s.bullet}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

function ReportPdfDoc({ data, branding, clientName, title, period, generatedAt }: {
  data: unknown;
  branding: Branding;
  clientName: string;
  title: string;
  period: { start: string; end: string };
  generatedAt: string;
}) {
  const color = safeColor(branding.brand_color);
  const s = makeStyles(color);
  const { gsc, ga4, insights } = normalizeReportData(data);

  const ins = insights as {
    executiveSummary?: string; summary?: string;
    keyWins?: string[]; highlights?: string[];
    issuesDetected?: string[]; growthOpportunities?: string[];
    recommendedActions?: string[]; recommendations?: string[];
  } | null;
  const executiveSummary = ins?.executiveSummary ?? ins?.summary ?? "";
  const keyWins = ins?.keyWins ?? ins?.highlights ?? [];
  const issuesDetected = ins?.issuesDetected ?? [];
  const growthOpportunities = ins?.growthOpportunities ?? [];
  const recommendedActions = ins?.recommendedActions ?? ins?.recommendations ?? [];

  const opportunities = gsc?.movers?.opportunities ?? [];
  const company = [branding.website, branding.contact_email].filter(Boolean).join("  ·  ");

  return (
    <Document title={title} author={branding.name || "Agency"}>
      {/* ── Cover ── */}
      <Page size="A4" style={s.coverPage}>
        <View style={[s.coverInner, { backgroundColor: shade(color), opacity: 1 }]}>
          <View>
            <View style={s.coverTop}>
              <View style={s.logoBox}><Text style={s.logoLetter}>{(branding.name || "A").charAt(0)}</Text></View>
              <Text style={s.agencyName}>{branding.name || "Your Agency"}</Text>
            </View>
          </View>
          <View>
            <Text style={s.badge}>{gsc && ga4 ? "SEO + ANALYTICS REPORT" : ga4 ? "ANALYTICS REPORT" : "SEO REPORT"}</Text>
            <Text style={s.coverTitle}>{title}</Text>
            <Text style={s.coverMeta}>Prepared for {clientName}</Text>
            <Text style={s.coverDetails}>Reporting period: {period.start} → {period.end}</Text>
            <Text style={s.coverDetails}>Generated: {generatedAt}</Text>
          </View>
          <View>
            {company ? <Text style={s.coverDetails}>{company}</Text> : null}
          </View>
        </View>
      </Page>

      {/* ── Content ── */}
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Text style={s.headerAgency}>{branding.name || "Your Agency"}</Text>
          <Text style={s.headerMeta}>{title}</Text>
        </View>
        <View style={s.footer} fixed>
          <Text>{branding.name || "Your Agency"}{branding.website ? `  ·  ${branding.website}` : ""}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          <Text>Generated {generatedAt}</Text>
        </View>

        {executiveSummary ? (
          <View style={s.section}>
            <Text style={s.h2}>Executive Summary</Text>
            <Text style={s.para}>{executiveSummary}</Text>
          </View>
        ) : null}

        {(gsc || ga4) && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>SEO vs Website Performance</Text>
            {gsc && (
              <View>
                <Text style={s.groupLabel}>Search Console</Text>
                <View style={s.kpiRow}>
                  <Kpi label="Clicks" value={fmt(gsc.totals.clicks)} delta={deltaPct(gsc.totals.clicks, gsc.previousTotals?.clicks)} s={s} />
                  <Kpi label="Impressions" value={fmt(gsc.totals.impressions)} delta={deltaPct(gsc.totals.impressions, gsc.previousTotals?.impressions)} s={s} />
                  <Kpi label="Avg CTR" value={pct1(gsc.totals.ctr)} delta={deltaPct(gsc.totals.ctr, gsc.previousTotals?.ctr)} s={s} />
                  <Kpi label="Avg Position" value={gsc.totals.position.toFixed(1)} delta={deltaPct(gsc.totals.position, gsc.previousTotals?.position)} lowerBetter s={s} />
                </View>
              </View>
            )}
            {ga4 && (
              <View>
                <Text style={s.groupLabel}>Website engagement (GA4)</Text>
                <View style={s.kpiRow}>
                  <Kpi label="Users" value={fmt(ga4.totals.users)} delta={deltaPct(ga4.totals.users, ga4.previousTotals?.users)} s={s} />
                  <Kpi label="Sessions" value={fmt(ga4.totals.sessions)} delta={deltaPct(ga4.totals.sessions, ga4.previousTotals?.sessions)} s={s} />
                  <Kpi label="Engagement" value={pct1(ga4.totals.engagementRate)} delta={deltaPct(ga4.totals.engagementRate, ga4.previousTotals?.engagementRate)} s={s} />
                  <Kpi label="Conversions" value={fmt(ga4.totals.conversions)} delta={deltaPct(ga4.totals.conversions, ga4.previousTotals?.conversions)} s={s} />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Trends */}
        {((gsc?.byDate?.length ?? 0) > 1 || (ga4?.byDate?.length ?? 0) > 1) && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Traffic & Visibility Trends</Text>
            <View style={s.chartWrap}>
              {(gsc?.byDate?.length ?? 0) > 1 && (
                <View style={s.chartCol}>
                  <Text style={s.chartLabel}>Search clicks</Text>
                  <LineChart values={gsc!.byDate.map((d) => d.clicks)} color={color} />
                </View>
              )}
              {(ga4?.byDate?.length ?? 0) > 1 && (
                <View style={s.chartCol}>
                  <Text style={s.chartLabel}>Sessions</Text>
                  <LineChart values={ga4!.byDate.map((d) => d.sessions)} color="#0ea5e9" />
                </View>
              )}
            </View>
            {(gsc?.byDate?.length ?? 0) > 1 && (
              <View style={{ marginTop: 8 }}>
                <Text style={s.chartLabel}>Average position (lower is better)</Text>
                <LineChart values={gsc!.byDate.map((d) => d.position)} color="#f59e0b" width={480} height={60} reversed />
              </View>
            )}
          </View>
        )}

        {/* Top queries */}
        {gsc && gsc.topQueries.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>Search Queries Driving Traffic</Text>
            <View style={s.tableHeader}>
              <Text style={[s.th, { flex: 1 }]}>Query</Text>
              <Text style={[s.th, { width: 50, textAlign: "right" }]}>Clicks</Text>
              <Text style={[s.th, { width: 55, textAlign: "right" }]}>Impr.</Text>
              <Text style={[s.th, { width: 40, textAlign: "right" }]}>CTR</Text>
              <Text style={[s.th, { width: 35, textAlign: "right" }]}>Pos</Text>
            </View>
            {gsc.topQueries.slice(0, 10).map((q) => (
              <View key={q.key} style={s.row} wrap={false}>
                <Text style={[s.td, { flex: 1 }]}>{q.key}</Text>
                <Text style={[s.td, { width: 50, textAlign: "right" }]}>{fmt(q.clicks)}</Text>
                <Text style={[s.td, { width: 55, textAlign: "right" }]}>{fmt(q.impressions)}</Text>
                <Text style={[s.td, { width: 40, textAlign: "right" }]}>{pct1(q.ctr)}</Text>
                <Text style={[s.td, { width: 35, textAlign: "right" }]}>{q.position.toFixed(1)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Landing pages */}
        {ga4 && (ga4.topLandingPages?.length ?? 0) > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>Landing Page Performance</Text>
            <View style={s.tableHeader}>
              <Text style={[s.th, { flex: 1 }]}>Page</Text>
              <Text style={[s.th, { width: 60, textAlign: "right" }]}>Sessions</Text>
              <Text style={[s.th, { width: 50, textAlign: "right" }]}>Users</Text>
            </View>
            {ga4.topLandingPages!.slice(0, 8).map((p) => (
              <View key={p.key} style={s.row} wrap={false}>
                <Text style={[s.td, { flex: 1 }]}>{pagePathOf(p.key)}</Text>
                <Text style={[s.td, { width: 60, textAlign: "right" }]}>{fmt(p.sessions)}</Text>
                <Text style={[s.td, { width: 50, textAlign: "right" }]}>{fmt(p.users)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Traffic sources + opportunities */}
        {(((ga4?.trafficSources?.length ?? 0) > 0) || opportunities.length > 0) && (
          <View style={[s.section, s.twoCol]} wrap={false}>
            {(ga4?.trafficSources?.length ?? 0) > 0 && (
              <View style={s.col}>
                <Text style={s.h2}>Traffic Sources</Text>
                <BarChart rows={ga4!.trafficSources!.slice(0, 5).map((t) => ({ label: t.key, value: t.sessions }))} color={color} width={200} />
                {ga4!.trafficSources!.slice(0, 5).map((t) => (
                  <View key={t.key} style={s.row}>
                    <Text style={[s.td, { flex: 1 }]}>{t.key}</Text>
                    <Text style={[s.td, { width: 60, textAlign: "right" }]}>{fmt(t.sessions)}</Text>
                  </View>
                ))}
              </View>
            )}
            {opportunities.length > 0 && (
              <View style={s.col}>
                <Text style={s.h2}>Conversion Opportunities</Text>
                {opportunities.slice(0, 5).map((o) => (
                  <View key={o.key} style={s.row}>
                    <Text style={[s.td, { flex: 1 }]}>{o.key}</Text>
                    <Text style={[s.td, { width: 50, textAlign: "right" }]}>pos {o.position.toFixed(1)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Audience */}
        {ga4 && ((ga4.devices?.length ?? 0) > 0 || (ga4.countries?.length ?? 0) > 0) && (
          <View style={[s.section, s.twoCol]} wrap={false}>
            {(ga4.devices?.length ?? 0) > 0 && (
              <View style={s.col}>
                <Text style={s.h2}>Devices</Text>
                {ga4.devices!.slice(0, 5).map((d) => (
                  <View key={d.key} style={s.row}>
                    <Text style={[s.td, { flex: 1, textTransform: "capitalize" }]}>{d.key}</Text>
                    <Text style={[s.td, { width: 60, textAlign: "right" }]}>{fmt(d.sessions)}</Text>
                  </View>
                ))}
              </View>
            )}
            {(ga4.countries?.length ?? 0) > 0 && (
              <View style={s.col}>
                <Text style={s.h2}>Top Countries</Text>
                {ga4.countries!.slice(0, 5).map((c) => (
                  <View key={c.key} style={s.row}>
                    <Text style={[s.td, { flex: 1 }]}>{c.key}</Text>
                    <Text style={[s.td, { width: 60, textAlign: "right" }]}>{fmt(c.sessions)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* AI insights */}
        {keyWins.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Key Wins</Text>
            <Bullets items={keyWins} s={s} />
          </View>
        )}
        {issuesDetected.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Issues Detected</Text>
            <Bullets items={issuesDetected} s={s} />
          </View>
        )}
        {growthOpportunities.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Growth Opportunities</Text>
            <Bullets items={growthOpportunities} s={s} />
          </View>
        )}
        {recommendedActions.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Recommended Actions</Text>
            <Bullets items={recommendedActions} s={s} />
          </View>
        )}

        {branding.footer_text ? (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Agency Notes</Text>
            <Text style={s.para}>{branding.footer_text}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

// Renders the report to a PDF buffer (for download or email attachment).
export async function renderReportPdf(args: {
  data: unknown;
  branding: Branding;
  clientName: string;
  title: string;
  period: { start: string; end: string };
  generatedAt?: string;
}): Promise<Buffer> {
  const generatedAt = args.generatedAt ?? new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return renderToBuffer(<ReportPdfDoc {...args} generatedAt={generatedAt} />);
}

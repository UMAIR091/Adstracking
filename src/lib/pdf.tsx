// Server-side branded PDF generation for report email attachments. Uses
// @react-pdf/renderer (no headless browser) so it runs on Vercel serverless.
// Renders the unified GSC + GA4 report data into a clean, white-label PDF.
import React from "react";
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { normalizeReportData } from "@/lib/report";

type Branding = { name: string; brand_color: string; website: string | null; footer_text: string | null };

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;
const safeColor = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#4f46e5");

function pagePathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname || "/") + (u.search || "");
  } catch {
    return url;
  }
}

function makeStyles(color: string) {
  return StyleSheet.create({
    page: { paddingBottom: 48, fontSize: 10, color: "#334155", fontFamily: "Helvetica" },
    cover: { backgroundColor: color, color: "#ffffff", paddingHorizontal: 40, paddingVertical: 44 },
    agency: { fontSize: 14, fontFamily: "Helvetica-Bold" },
    title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 32 },
    subtitle: { fontSize: 11, color: "#e2e8f0", marginTop: 6 },
    body: { paddingHorizontal: 40, paddingTop: 24 },
    section: { marginBottom: 20 },
    h2: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#0f172a", marginBottom: 8 },
    para: { fontSize: 10, lineHeight: 1.5, color: "#334155" },
    groupLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color, marginBottom: 6, marginTop: 4 },
    kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    kpi: { width: "23%", border: "1pt solid #e9edf2", borderRadius: 6, padding: 8 },
    kpiLabel: { fontSize: 8, color: "#64748b" },
    kpiValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color, marginTop: 3 },
    tableHeader: { flexDirection: "row", borderBottom: "1pt solid #e9edf2", paddingBottom: 4, marginBottom: 2 },
    row: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.5pt solid #f1f5f9" },
    th: { fontSize: 8, color: "#94a3b8", fontFamily: "Helvetica-Bold" },
    td: { fontSize: 9, color: "#334155" },
    bullet: { flexDirection: "row", marginBottom: 4 },
    bulletDot: { width: 10, fontSize: 10, color },
    bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.4 },
    footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#94a3b8", borderTop: "1pt solid #eef1f5", paddingTop: 8 },
  });
}

function Kpi({ label, value, s }: { label: string; value: string; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
    </View>
  );
}

function Bullets({ items, s }: { items: string[]; s: ReturnType<typeof makeStyles> }) {
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

function ReportPdfDoc({
  data, branding, clientName, title, period,
}: {
  data: unknown;
  branding: Branding;
  clientName: string;
  title: string;
  period: { start: string; end: string };
}) {
  const color = safeColor(branding.brand_color);
  const s = makeStyles(color);
  const { gsc, ga4, insights } = normalizeReportData(data);

  const ins = insights as {
    executiveSummary?: string; summary?: string;
    keyWins?: string[]; highlights?: string[];
    issuesDetected?: string[]; recommendedActions?: string[]; recommendations?: string[];
  } | null;
  const executiveSummary = ins?.executiveSummary ?? ins?.summary ?? "";
  const keyWins = ins?.keyWins ?? ins?.highlights ?? [];
  const issuesDetected = ins?.issuesDetected ?? [];
  const recommendedActions = ins?.recommendedActions ?? ins?.recommendations ?? [];

  return (
    <Document title={title} author={branding.name || "Agency"}>
      <Page size="A4" style={s.page}>
        {/* Cover band */}
        <View style={s.cover}>
          <Text style={s.agency}>{branding.name || "Your Agency"}</Text>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>Prepared for {clientName} · {period.start} → {period.end}</Text>
        </View>

        <View style={s.body}>
          {/* Executive Summary */}
          {executiveSummary ? (
            <View style={s.section}>
              <Text style={s.h2}>Executive Summary</Text>
              <Text style={s.para}>{executiveSummary}</Text>
            </View>
          ) : null}

          {/* KPIs */}
          {(gsc || ga4) && (
            <View style={s.section}>
              <Text style={s.h2}>SEO vs Website Performance</Text>
              {gsc && (
                <>
                  <Text style={s.groupLabel}>Search Console</Text>
                  <View style={s.kpiRow}>
                    <Kpi label="Clicks" value={fmt(gsc.totals.clicks)} s={s} />
                    <Kpi label="Impressions" value={fmt(gsc.totals.impressions)} s={s} />
                    <Kpi label="Avg CTR" value={pct1(gsc.totals.ctr)} s={s} />
                    <Kpi label="Avg Position" value={gsc.totals.position.toFixed(1)} s={s} />
                  </View>
                </>
              )}
              {ga4 && (
                <>
                  <Text style={s.groupLabel}>Website engagement (GA4)</Text>
                  <View style={s.kpiRow}>
                    <Kpi label="Users" value={fmt(ga4.totals.users)} s={s} />
                    <Kpi label="Sessions" value={fmt(ga4.totals.sessions)} s={s} />
                    <Kpi label="Engagement" value={pct1(ga4.totals.engagementRate)} s={s} />
                    <Kpi label="Conversions" value={fmt(ga4.totals.conversions)} s={s} />
                  </View>
                </>
              )}
            </View>
          )}

          {/* Top Queries */}
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
              {gsc.topQueries.slice(0, 8).map((q) => (
                <View key={q.key} style={s.row}>
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
                <View key={p.key} style={s.row}>
                  <Text style={[s.td, { flex: 1 }]}>{pagePathOf(p.key)}</Text>
                  <Text style={[s.td, { width: 60, textAlign: "right" }]}>{fmt(p.sessions)}</Text>
                  <Text style={[s.td, { width: 50, textAlign: "right" }]}>{fmt(p.users)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* AI sections */}
          {keyWins.length > 0 && (
            <View style={s.section}>
              <Text style={s.h2}>Key Wins</Text>
              <Bullets items={keyWins} s={s} />
            </View>
          )}
          {issuesDetected.length > 0 && (
            <View style={s.section}>
              <Text style={s.h2}>Issues Detected</Text>
              <Bullets items={issuesDetected} s={s} />
            </View>
          )}
          {recommendedActions.length > 0 && (
            <View style={s.section}>
              <Text style={s.h2}>Recommended Actions</Text>
              <Bullets items={recommendedActions} s={s} />
            </View>
          )}

          {branding.footer_text ? (
            <View style={s.section}>
              <Text style={s.h2}>Agency Notes</Text>
              <Text style={s.para}>{branding.footer_text}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.footer} fixed>
          <Text>Prepared by {branding.name || "Your Agency"}</Text>
          {branding.website ? <Text>{branding.website}</Text> : <Text> </Text>}
        </View>
      </Page>
    </Document>
  );
}

// Renders the report to a PDF buffer for use as an email attachment.
export async function renderReportPdf(args: {
  data: unknown;
  branding: Branding;
  clientName: string;
  title: string;
  period: { start: string; end: string };
}): Promise<Buffer> {
  return renderToBuffer(<ReportPdfDoc {...args} />);
}

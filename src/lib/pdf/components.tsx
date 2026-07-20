// Reusable building blocks for the PDF report: cover page, running page
// chrome, numbered sections, KPI cards, generic tables, insight callouts and
// auto-generated highlight chips. Purely presentational — data prep lives in
// index.tsx.
import React from "react";
import { Page, View, Text, Image, Svg, Circle } from "@react-pdf/renderer";
import { ink, tint, up, down, type S, type Tone } from "./theme";
import { deltaLabel, fmtDate, truncate } from "./format";
import { Icon, TrendArrow, Gauge } from "./icons";
import type { InsightCardData, Tile as TileData, Score } from "./analysis";

export type Branding = {
  name: string;
  brand_color: string;
  website: string | null;
  footer_text: string | null;
  contact_email?: string | null;
  logo_url?: string | null;
};

// ── Cover page ───────────────────────────────────────────────────────────────
export function CoverPage({ s, color, branding, logoSrc, badge, title, clientName, period, generatedAt }: {
  s: S;
  color: string;
  branding: Branding;
  logoSrc: string | null;
  badge: string;
  title: string;
  clientName: string;
  period: { start: string; end: string };
  generatedAt: string;
}) {
  const contact = [branding.website, branding.contact_email].filter(Boolean).join("   ·   ");
  return (
    <Page size="A4" style={s.coverPage}>
      {/* Subtle decorative geometry, tone-on-tone. Solid tints — the PDF
          engine mis-renders rgba() strokes. */}
      <Svg style={{ position: "absolute", top: -70, right: -70 }} width={300} height={300}>
        <Circle cx={150} cy={150} r={130} stroke={tint(color, 0.12)} strokeWidth={26} fill="none" />
      </Svg>
      <Svg style={{ position: "absolute", bottom: -110, left: -90 }} width={320} height={320}>
        <Circle cx={160} cy={160} r={140} stroke={tint(color, 0.08)} strokeWidth={34} fill="none" />
      </Svg>

      <View style={s.coverInner}>
        <View style={s.coverTop}>
          <View style={s.coverBrandRow}>
            <View style={s.logoBox}>
              {logoSrc ? <Image src={logoSrc} style={s.logoImg} /> : <Text style={s.logoLetter}>{(branding.name || "A").charAt(0).toUpperCase()}</Text>}
            </View>
            <Text style={s.agencyName}>{branding.name || "Your Agency"}</Text>
          </View>
          <Text style={s.coverKicker}>Performance Report</Text>
        </View>

        <View>
          <Text style={s.badge}>{badge.toUpperCase()}</Text>
          <Text style={s.coverTitle}>{title}</Text>
          <Text style={s.coverClient}>Prepared for {clientName}</Text>
          <View style={s.coverMetaGrid}>
            <View style={s.coverMetaCell}>
              <Text style={s.coverMetaLabel}>Reporting period</Text>
              <Text style={s.coverMetaValue}>{fmtDate(period.start)} – {fmtDate(period.end)}</Text>
            </View>
            <View style={s.coverMetaCell}>
              <Text style={s.coverMetaLabel}>Generated</Text>
              <Text style={s.coverMetaValue}>{generatedAt}</Text>
            </View>
            <View style={s.coverMetaCell}>
              <Text style={s.coverMetaLabel}>Prepared by</Text>
              <Text style={s.coverMetaValue}>{branding.name || "Your Agency"}</Text>
            </View>
          </View>
        </View>

        <View style={s.coverBottom}>
          <Text style={s.coverContact}>{contact}</Text>
          <Text style={s.coverConfidential}>Confidential</Text>
        </View>
      </View>
    </Page>
  );
}

// ── Running header + footer (rendered `fixed` on every content page) ─────────
export function PageChrome({ s, branding, title, generatedAt, logoSrc }: {
  s: S;
  branding: Branding;
  title: string;
  generatedAt: string;
  logoSrc: string | null;
}) {
  return (
    <>
      <View style={s.header} fixed>
        <View style={s.headerLeft}>
          {logoSrc ? <Image src={logoSrc} style={s.headerLogo} /> : null}
          <Text style={s.headerAgency}>{branding.name || "Your Agency"}</Text>
        </View>
        <Text style={s.headerMeta}>{title}</Text>
      </View>
      <View style={s.footer} fixed>
        <Text style={s.footerText}>{branding.name || "Your Agency"}{branding.website ? `   ·   ${branding.website}` : ""}</Text>
        <Text style={s.footerText}>Generated {generatedAt}</Text>
        <Text style={s.footerPage} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  );
}

// ── Numbered section with accent rule ────────────────────────────────────────
export function Section({ s, num, title, subtitle, children, breakBefore }: {
  s: S;
  num: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  breakBefore?: boolean;
}) {
  return (
    <View style={s.section} break={breakBefore} minPresenceAhead={90}>
      <View style={s.sectionHead}>
        <Text style={s.sectionNum}>{num}</Text>
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      <View style={s.sectionRule} />
      {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

// ── KPI card (dashboard-widget style: icon chip, value, trend indicator) ─────
export function KpiCard({ s, color, icon = "chart", label, value, delta, lowerBetter, hero }: {
  s: S;
  color: string;
  icon?: string;
  label: string;
  value: string;
  delta: number | null;
  lowerBetter?: boolean;
  hero?: boolean;
}) {
  const good = delta == null ? false : lowerBetter ? delta < 0 : delta > 0;
  return (
    <View style={hero ? s.heroKpi : s.kpi} wrap={false}>
      <View style={hero ? s.heroTop : s.kpiTop}>
        <View style={s.kpiIconBox}>
          <Icon name={icon} size={9} color={color} strokeWidth={2.2} />
        </View>
        <Text style={s.kpiLabel}>{label}</Text>
      </View>
      <Text style={hero ? s.heroValue : s.kpiValue}>{value}</Text>
      <View style={s.kpiDeltaRow}>
        {delta != null ? (
          <>
            <TrendArrow dir={delta >= 0 ? "up" : "down"} color={good ? up : down} size={5.5} />
            <Text style={[s.kpiDelta, good ? s.up : s.down]}>{deltaLabel(delta)}</Text>
            <Text style={s.kpiDeltaHint}>vs prev. period</Text>
          </>
        ) : (
          <Text style={s.kpiDeltaHint}> </Text>
        )}
      </View>
    </View>
  );
}

// ── Executive dashboard blocks ───────────────────────────────────────────────
export function GaugePanel({ s, color, data }: { s: S; color: string; data: Score }) {
  const size = 88;
  return (
    <View style={s.gaugeCard} wrap={false}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <View style={{ position: "absolute", top: 0, left: 0 }}>
          <Gauge score={data.score} size={size} color={color} track={ink.lineSoft} />
        </View>
        <Text style={s.gaugeScore}>{data.score}</Text>
        <Text style={s.gaugeOutOf}>/ 100</Text>
      </View>
      <Text style={s.gaugeLabel}>{data.label}</Text>
      <Text style={s.gaugeCaption}>Overall performance vs. the previous period</Text>
    </View>
  );
}

export function DashTile({ s, tone, icon, data }: { s: S; tone: Tone; icon: string; data: TileData }) {
  return (
    <View style={[s.tile, { borderBottom: `2.5pt solid ${tone.border}` }]} wrap={false}>
      <View style={s.tileHead}>
        <View style={[s.tileIconBox, { backgroundColor: tone.bg }]}>
          <Icon name={icon} size={9.5} color={tone.border} strokeWidth={2.2} />
        </View>
        <Text style={s.tileTitle}>{data.title}</Text>
      </View>
      <Text style={s.tileValue}>{truncate(data.value, 52)}</Text>
      <Text style={s.tileSub}>{data.sub}</Text>
    </View>
  );
}

// ── Scannable insight cards (replaces paragraph-style callouts) ──────────────
export function InsightCards({ s, tone, icon, kind, items }: {
  s: S;
  tone: Tone;
  icon: string;
  kind: string;
  items: InsightCardData[];
}) {
  if (items.length === 0) return null;
  return (
    <View style={s.insightGrid}>
      {items.map((c, i) => (
        <View key={i} style={[s.insightCard, { borderTop: `2.5pt solid ${tone.border}` }]} wrap={false}>
          <View style={s.insightHead}>
            <View style={[s.insightIconBox, { backgroundColor: tone.bg }]}>
              <Icon name={icon} size={9} color={tone.border} strokeWidth={2.4} />
            </View>
            <Text style={[s.insightKind, { color: tone.fg }]}>{kind}</Text>
          </View>
          <Text style={s.insightLead}>{c.lead}</Text>
          {c.body ? <Text style={s.insightBody}>{c.body}</Text> : null}
        </View>
      ))}
    </View>
  );
}

// ── Consulting-style action card with priority / impact / focus badges ───────
const LEVEL_TONES: Record<string, { bg: string; fg: string }> = {
  High: { bg: "#fee2e2", fg: "#b91c1c" },
  Medium: { bg: "#fef3c7", fg: "#b45309" },
  Low: { bg: "#e2e8f0", fg: "#475569" },
};
const IMPACT_TONES: Record<string, { bg: string; fg: string }> = {
  High: { bg: "#ecfdf5", fg: "#047857" },
  Medium: { bg: "#f0f9ff", fg: "#0369a1" },
  Low: { bg: "#f1f5f9", fg: "#64748b" },
};

export function ActionCard({ s, color, index, priority, impact, focus, card }: {
  s: S;
  color: string;
  index: number;
  priority: "High" | "Medium" | "Low";
  impact: "High" | "Medium" | "Low";
  focus: string;
  card: InsightCardData;
}) {
  const pt = LEVEL_TONES[priority];
  const it = IMPACT_TONES[impact];
  return (
    <View style={s.actionCard} wrap={false}>
      <View style={s.actionNum}>
        <Text style={s.actionNumText}>{index + 1}</Text>
      </View>
      <View style={s.actionBody}>
        <View style={s.actionMetaRow}>
          <Text style={[s.metaBadge, { backgroundColor: pt.bg, color: pt.fg }]}>{priority} priority</Text>
          <Text style={[s.metaBadge, { backgroundColor: it.bg, color: it.fg }]}>{impact} impact</Text>
          <Text style={[s.metaBadge, { backgroundColor: tint(color, 0.92), color }]}>{focus}</Text>
        </View>
        <Text style={s.actionLead}>{card.lead}</Text>
        {card.body ? <Text style={s.actionText}>{card.body}</Text> : null}
      </View>
    </View>
  );
}

// ── Generic data table (bordered card, zebra rows, page-break safe rows) ─────
export type Col<T> = {
  header: string;
  flex?: number;
  width?: number;
  align?: "left" | "right";
  strong?: boolean;
  cell: (row: T) => string;
};

export function DataTable<T>({ s, cols, rows }: { s: S; cols: Col<T>[]; rows: T[] }) {
  const colStyle = (c: Col<T>) =>
    ({ ...(c.width ? { width: c.width } : { flex: c.flex ?? 1 }), textAlign: c.align ?? "left" }) as const;
  return (
    <View style={s.table}>
      <View style={s.tableHeader} wrap={false}>
        {cols.map((c, i) => (
          <Text key={i} style={[s.th, colStyle(c)]}>{c.header}</Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={[s.row, ...(ri % 2 === 1 ? [s.rowAlt] : []), ...(ri === rows.length - 1 ? [s.rowLast] : [])]} wrap={false}>
          {cols.map((c, ci) => (
            <Text key={ci} style={[c.strong ? s.tdStrong : s.td, colStyle(c)]}>{truncate(c.cell(r))}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── “At a glance” movement chips for the executive summary ───────────────────
export type Highlight = { text: string; delta: number; good: boolean };

export function HighlightChips({ s, items }: { s: S; items: Highlight[] }) {
  if (items.length === 0) return null;
  return (
    <View style={s.hlGrid}>
      {items.map((h, i) => (
        <View key={i} style={s.hlChip} wrap={false}>
          <View style={[s.hlDot, { backgroundColor: h.good ? up : down }]} />
          <Text style={s.hlText}>{h.text}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Chart card wrapper (title + headline value above the plot) ───────────────
export function ChartCard({ s, title, value, hint, children }: {
  s: S;
  title: string;
  value?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.chartCard} wrap={false}>
      <View style={s.chartHead}>
        <View>
          <Text style={s.chartTitle}>{title}</Text>
          {hint ? <Text style={s.chartHint}>{hint}</Text> : null}
        </View>
        {value ? <Text style={s.chartValue}>{value}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// Simple bulleted list used outside callouts (agency notes etc.).
export function Bullets({ s, items }: { s: S; items: string[] }) {
  return (
    <View>
      {items.map((it, i) => (
        <View key={i} style={s.bullet} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{it}</Text>
        </View>
      ))}
    </View>
  );
}


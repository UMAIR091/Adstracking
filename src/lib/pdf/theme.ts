// Design tokens + StyleSheet factory for the premium PDF report. All colors,
// spacing and type sizes live here so every component stays visually consistent
// and the whole document re-brands from a single agency color.
import { StyleSheet } from "@react-pdf/renderer";

export const safeColor = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#4f46e5");

// Mixes a hex color toward white (t in 0..1). Used for soft brand tints.
// Returns hex — the PDF engine mis-parses rgba()/rgb() in borders and strokes.
const hex2 = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");

export function tint(hex: string, t: number): string {
  try {
    const n = parseInt(hex.replace("#", ""), 16);
    const mix = (c: number) => Math.round(c + (255 - c) * t);
    return `#${hex2(mix((n >> 16) & 255))}${hex2(mix((n >> 8) & 255))}${hex2(mix(n & 255))}`;
  } catch {
    return hex;
  }
}

// Darkens a hex color (t in 0..1).
export function shade(hex: string, t = 0.25): string {
  try {
    const n = parseInt(hex.replace("#", ""), 16);
    const mix = (c: number) => Math.max(0, Math.round(c * (1 - t)));
    return `#${hex2(mix((n >> 16) & 255))}${hex2(mix((n >> 8) & 255))}${hex2(mix(n & 255))}`;
  } catch {
    return hex;
  }
}

// Neutral + semantic palette (slate-based, matches the web report UI).
export const ink = {
  900: "#0f172a",
  700: "#334155",
  500: "#64748b",
  400: "#94a3b8",
  line: "#e2e8f0",
  lineSoft: "#eef2f6",
  bgSoft: "#f8fafc",
  white: "#ffffff",
};

export type Tone = { fg: string; bg: string; border: string };
export const tones: Record<"positive" | "warning" | "info" | "neutral", Tone> = {
  positive: { fg: "#047857", bg: "#ecfdf5", border: "#10b981" },
  warning: { fg: "#b45309", bg: "#fffbeb", border: "#f59e0b" },
  info: { fg: "#0369a1", bg: "#f0f9ff", border: "#38bdf8" },
  neutral: { fg: "#334155", bg: "#f8fafc", border: "#cbd5e1" },
};

export const up = "#059669";
export const down = "#e11d48";

// Chart series colors: brand first, then complementary hues that print well.
export const seriesColors = (brand: string) => [brand, "#0ea5e9", "#f59e0b", "#10b981", "#8b5cf6", "#94a3b8"];

export function makeStyles(color: string) {
  // Solid tints for cover borders — rgba() borders render incorrectly in the
  // PDF engine, so translucency is faked by mixing toward white.
  const coverLine = tint(color, 0.45);
  return StyleSheet.create({
    // ── Cover ────────────────────────────────────────────────────────────────
    coverPage: { backgroundColor: color, color: ink.white, padding: 0 },
    coverInner: { flex: 1, paddingHorizontal: 52, paddingVertical: 52, justifyContent: "space-between" },
    coverTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    coverBrandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    logoBox: { width: 46, height: 46, borderRadius: 9, backgroundColor: ink.white, alignItems: "center", justifyContent: "center", padding: 5 },
    logoImg: { width: 36, height: 36, objectFit: "contain" },
    logoLetter: { fontSize: 22, fontFamily: "Helvetica-Bold", color },
    agencyName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: ink.white },
    coverKicker: { fontSize: 8, color: "rgba(255,255,255,0.75)", letterSpacing: 2, textTransform: "uppercase" },
    badge: { alignSelf: "flex-start", borderRadius: 20, backgroundColor: "rgba(255,255,255,0.16)", border: `1pt solid ${coverLine}`, paddingHorizontal: 12, paddingVertical: 5, fontSize: 8.5, letterSpacing: 1.5, marginBottom: 18 },
    coverTitle: { fontSize: 32, fontFamily: "Helvetica-Bold", color: ink.white, lineHeight: 1.12, maxWidth: 420 },
    coverClient: { fontSize: 14, color: "rgba(255,255,255,0.95)", marginTop: 14 },
    coverMetaGrid: { flexDirection: "row", gap: 22, marginTop: 34 },
    coverMetaCell: { flex: 1, borderTop: `1.5pt solid ${coverLine}`, paddingTop: 8 },
    coverMetaLabel: { fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.7)", marginBottom: 4 },
    coverMetaValue: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: ink.white },
    coverBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    coverContact: { fontSize: 9, color: "rgba(255,255,255,0.85)" },
    coverConfidential: { fontSize: 7.5, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.6)" },

    // ── Page chrome ──────────────────────────────────────────────────────────
    page: { paddingTop: 66, paddingBottom: 58, paddingHorizontal: 46, fontSize: 9.5, color: ink[700], fontFamily: "Helvetica", backgroundColor: ink.white },
    header: { position: "absolute", top: 24, left: 46, right: 46, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottom: `1pt solid ${ink.lineSoft}`, paddingBottom: 9 },
    headerAgency: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color },
    headerLogo: { width: 14, height: 14, objectFit: "contain", marginRight: 6 },
    headerLeft: { flexDirection: "row", alignItems: "center" },
    headerMeta: { fontSize: 7.5, color: ink[400] },
    footer: { position: "absolute", bottom: 24, left: 46, right: 46, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTop: `1pt solid ${ink.lineSoft}`, paddingTop: 9 },
    footerText: { fontSize: 7.5, color: ink[400] },
    footerPage: { fontSize: 7.5, color: ink[500], fontFamily: "Helvetica-Bold" },

    // ── Sections ─────────────────────────────────────────────────────────────
    section: { marginBottom: 26 },
    sectionHead: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 4 },
    sectionNum: { fontSize: 9, fontFamily: "Helvetica-Bold", color },
    sectionTitle: { fontSize: 15, fontFamily: "Helvetica-Bold", color: ink[900], letterSpacing: -0.2 },
    sectionSub: { fontSize: 8.5, color: ink[500], marginBottom: 10 },
    sectionRule: { height: 2.5, width: 30, backgroundColor: color, borderRadius: 1.5, marginBottom: 12, marginTop: 5 },
    h3: { fontSize: 10, fontFamily: "Helvetica-Bold", color: ink[900], marginBottom: 7 },
    groupLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: ink[500], letterSpacing: 1, textTransform: "uppercase", marginTop: 10, marginBottom: 7 },
    para: { fontSize: 9.5, lineHeight: 1.65, color: ink[700] },
    summaryPanel: { backgroundColor: ink.bgSoft, border: `1pt solid ${ink.line}`, borderRadius: 9, padding: 15 },

    // ── KPI cards ────────────────────────────────────────────────────────────
    kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    kpi: { width: "23.6%", border: `1pt solid ${ink.line}`, borderRadius: 8, padding: 10, backgroundColor: ink.white },
    kpiTop: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
    heroTop: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 7, minHeight: 24 },
    kpiIconBox: { width: 15, height: 15, borderRadius: 4.5, backgroundColor: tint(color, 0.9), alignItems: "center", justifyContent: "center" },
    kpiLabel: { fontSize: 6.8, color: ink[500], letterSpacing: 0.7, textTransform: "uppercase", flex: 1 },
    kpiValue: { fontSize: 15.5, fontFamily: "Helvetica-Bold", color: ink[900], letterSpacing: -0.3 },
    kpiDeltaRow: { flexDirection: "row", alignItems: "center", gap: 3.5, marginTop: 5 },
    kpiDelta: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },
    kpiDeltaHint: { fontSize: 6.5, color: ink[400] },
    up: { color: up },
    down: { color: down },

    // ── Executive dashboard ──────────────────────────────────────────────────
    dashRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    gaugeCard: { width: 150, border: `1pt solid ${ink.line}`, borderRadius: 9, padding: 12, alignItems: "center", backgroundColor: ink.white },
    gaugeScore: { fontSize: 21, fontFamily: "Helvetica-Bold", color: ink[900], letterSpacing: -0.5 },
    gaugeOutOf: { fontSize: 6.5, color: ink[400] },
    gaugeLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color, marginTop: 4 },
    gaugeCaption: { fontSize: 6.5, color: ink[400], marginTop: 2, textAlign: "center" },
    dashSummaryCard: { flex: 1, backgroundColor: ink.bgSoft, border: `1pt solid ${ink.line}`, borderRadius: 9, padding: 13 },
    dashSummaryTitle: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: ink[500], letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
    dashSummaryText: { fontSize: 9, lineHeight: 1.6, color: ink[700] },
    heroKpi: { flex: 1, border: `1pt solid ${ink.line}`, borderRadius: 9, padding: 11, backgroundColor: ink.white },
    heroValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: ink[900], letterSpacing: -0.4 },
    tile: { flex: 1, border: `1pt solid ${ink.line}`, borderRadius: 9, padding: 11, backgroundColor: ink.white },
    tileHead: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 7 },
    tileIconBox: { width: 16, height: 16, borderRadius: 5, alignItems: "center", justifyContent: "center" },
    tileTitle: { fontSize: 6.8, fontFamily: "Helvetica-Bold", letterSpacing: 0.7, textTransform: "uppercase", color: ink[500], flex: 1 },
    tileValue: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: ink[900], marginBottom: 3 },
    tileSub: { fontSize: 7.5, lineHeight: 1.45, color: ink[500] },

    // ── Insight & action cards ───────────────────────────────────────────────
    insightGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    insightCard: { width: "48.9%", borderRadius: 8, padding: 11, backgroundColor: ink.white, border: `1pt solid ${ink.line}` },
    insightHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
    insightIconBox: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    insightKind: { fontSize: 6.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, textTransform: "uppercase" },
    insightLead: { fontSize: 8.8, fontFamily: "Helvetica-Bold", color: ink[900], lineHeight: 1.45, marginBottom: 3 },
    insightBody: { fontSize: 8.2, lineHeight: 1.5, color: ink[500] },
    actionCard: { flexDirection: "row", gap: 10, border: `1pt solid ${ink.line}`, borderRadius: 8, padding: 11, marginBottom: 8, backgroundColor: ink.white },
    actionNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: tint(color, 0.9), alignItems: "center", justifyContent: "center" },
    actionNumText: { fontSize: 9, fontFamily: "Helvetica-Bold", color },
    actionBody: { flex: 1 },
    actionMetaRow: { flexDirection: "row", gap: 5, marginBottom: 5, alignItems: "center" },
    metaBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontSize: 6.2, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, textTransform: "uppercase" },
    actionLead: { fontSize: 8.8, fontFamily: "Helvetica-Bold", color: ink[900], lineHeight: 1.45 },
    actionText: { fontSize: 8.2, lineHeight: 1.5, color: ink[500], marginTop: 2 },

    // ── Forecast ─────────────────────────────────────────────────────────────
    forecastGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 10 },
    forecastCard: { width: "31.8%", border: `1pt solid ${ink.line}`, borderRadius: 8, padding: 10, backgroundColor: ink.white },
    forecastProj: { fontSize: 14, fontFamily: "Helvetica-Bold", color: ink[900], letterSpacing: -0.3 },
    forecastCur: { fontSize: 6.8, color: ink[400], marginTop: 3 },
    confidenceBadge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2.5, fontSize: 6.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.6, textTransform: "uppercase" },

    // ── Charts ───────────────────────────────────────────────────────────────
    chartCard: { border: `1pt solid ${ink.line}`, borderRadius: 9, padding: 13, backgroundColor: ink.white },
    chartHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
    chartTitle: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: ink[700] },
    chartValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: ink[900] },
    chartHint: { fontSize: 6.5, color: ink[400], marginTop: 1.5 },
    chartRow: { flexDirection: "row", gap: 10 },
    chartCol: { flex: 1 },
    legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    legendSwatch: { width: 7, height: 7, borderRadius: 2 },
    legendText: { fontSize: 7, color: ink[500] },

    // ── Tables ───────────────────────────────────────────────────────────────
    table: { border: `1pt solid ${ink.line}`, borderRadius: 8, overflow: "hidden" },
    tableHeader: { flexDirection: "row", backgroundColor: ink.bgSoft, borderBottom: `1pt solid ${ink.line}`, paddingVertical: 6.5, paddingHorizontal: 11 },
    th: { fontSize: 7, color: ink[500], fontFamily: "Helvetica-Bold", letterSpacing: 0.6, textTransform: "uppercase" },
    row: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 11, borderBottom: `0.5pt solid ${ink.lineSoft}` },
    rowAlt: { backgroundColor: "#fafbfd" },
    rowLast: { borderBottom: 0 },
    td: { fontSize: 8.5, color: ink[700] },
    tdStrong: { fontSize: 8.5, color: ink[900], fontFamily: "Helvetica-Bold" },

    // ── Share bars (composition) ─────────────────────────────────────────────
    shareTrack: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: ink.lineSoft },
    barRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
    barLabel: { width: 92, fontSize: 8, color: ink[700] },
    barTrack: { flex: 1, height: 9, borderRadius: 4.5, backgroundColor: ink.lineSoft, overflow: "hidden" },
    barFill: { height: 9, borderRadius: 4.5, backgroundColor: color },
    barValue: { width: 54, fontSize: 8, color: ink[900], fontFamily: "Helvetica-Bold", textAlign: "right" },

    // ── Callouts (AI insights) ───────────────────────────────────────────────
    callout: { borderRadius: 7, padding: 11, marginBottom: 10 },
    calloutHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 7 },
    calloutGlyph: { width: 13, height: 13, borderRadius: 7, alignItems: "center", justifyContent: "center" },
    calloutGlyphText: { fontSize: 8, color: ink.white, fontFamily: "Helvetica-Bold" },
    calloutTitle: { fontSize: 8.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, textTransform: "uppercase" },
    bullet: { flexDirection: "row", marginBottom: 4 },
    bulletDot: { width: 11, fontSize: 9, color: ink[500] },
    bulletText: { flex: 1, fontSize: 9, lineHeight: 1.5, color: ink[700] },

    // ── Highlights (auto “at a glance” chips) ────────────────────────────────
    hlGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    hlChip: { flexDirection: "row", alignItems: "center", gap: 5, border: `1pt solid ${ink.line}`, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 8, width: "48.9%" },
    hlDot: { width: 6, height: 6, borderRadius: 3 },
    hlText: { fontSize: 8, color: ink[700], flex: 1 },

    // ── Layout helpers ───────────────────────────────────────────────────────
    twoCol: { flexDirection: "row", gap: 12 },
    col: { flex: 1 },
  });
}

export type S = ReturnType<typeof makeStyles>;

// Presentational building blocks for the client report — the live document
// (ReportDocument) and the marketing sample (ReportPreview) both render with
// these, so the two cannot drift apart visually. Nothing here decides WHAT a
// report says or which sections appear; that stays with the callers and the
// lib/reports layer. Only how it looks.
//
// Colours are the --report-* tokens (light-only: the document is pinned to
// `theme-light`). Every accent beyond them is the agency's own brand colour,
// passed in as a `Brand` so the report stays fully white-label.
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { reportFonts } from "@/lib/reportFonts";

// ─── Brand colour ───────────────────────────────────────────────────────────

export type Brand = {
  /** The agency colour, for fills, lines, bars and dots. */
  color: string;
  /** The same colour at 8% — badge, note panel. */
  soft: string;
  /** Brand-coloured TEXT. Ink instead when the colour is too light to read. */
  ink: string;
  /** Text on a brand fill: white, or ink on a very light brand. */
  onFill: string;
};

const INK = "#12171C";

function hexRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Derives every brand tone the report uses from the agency's saved colour. */
export function brandTones(color: string): Brand {
  const rgb = hexRgb(color);
  if (!rgb) return { color, soft: "rgb(18 23 28 / 0.06)", ink: INK, onFill: "#FFFFFF" };
  const [r, g, b] = rgb;
  // Perceived brightness on the 0–255 scale the handoff specifies (> 150 = light).
  const light = 0.299 * r + 0.587 * g + 0.114 * b > 150;
  return {
    color,
    soft: `rgb(${r} ${g} ${b} / 0.08)`,
    ink: light ? INK : color,
    onFill: light ? INK : "#FFFFFF",
  };
}

// recharts writes colours into SVG attributes, where CSS variables are not
// reliably resolved, so the chart colours are spelled out here. They mirror the
// --report-* tokens in globals.css.
export const CHART = {
  grid: "#F0EEEA", // --report-line-soft
  axis: "#6A7078", // --report-meta
  tooltipBorder: "#EEECE8", // --report-line
  second: "#0EA5E9", // the GA4 series keeps its own colour
  position: "#E5A75F",
};

/** Channel / share palette: the brand first, then quiet neutrals. */
export const sharePalette = (brand: Brand) => [brand.color, CHART.second, "#E5A75F", "#8B8F96", "#C9C6BF", "#DDD9D1"];

// ─── Document shell ─────────────────────────────────────────────────────────

/**
 * The white sheet. `theme-light` pins it to the light palette — a report is a
 * deliverable that gets printed, exported and opened by a client, so it stays
 * on white paper whatever theme the app around it is in.
 */
export function ReportPaper({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <article
      id={id}
      className={`${reportFonts} theme-light mx-auto w-full min-w-0 max-w-[880px] overflow-hidden rounded-[20px] bg-white font-report text-report-ink tabular-nums shadow-[0_1px_2px_rgb(18_23_28/0.05),0_24px_48px_-28px_rgb(18_23_28/0.22)] print:max-w-none print:rounded-none print:shadow-none [-webkit-print-color-adjust:exact] [print-color-adjust:exact]`}
    >
      {children}
    </article>
  );
}

/** The body below the cover: generous padding, 56px between sections. */
export function ReportBody({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-14 p-[clamp(24px,5vw,48px)]">{children}</div>;
}

// ─── Cover ──────────────────────────────────────────────────────────────────

export type GlanceCell = { label: string; value: string; delta?: { text: string; good: boolean } | null };

export function ReportCover({
  brand,
  agencyName,
  agencyLogoUrl,
  agencyWebsite,
  badge,
  title,
  clientName,
  clientLogoUrl,
  meta,
  glance,
}: {
  brand: Brand;
  agencyName: string;
  agencyLogoUrl: string | null;
  agencyWebsite?: string | null;
  badge?: string;
  title: string;
  clientName: string;
  clientLogoUrl?: string | null;
  /** "1 Aug – 28 Aug 2026", "vs previous 28 days" … joined with a dot. */
  meta: string[];
  glance?: GlanceCell[];
}) {
  return (
    <div className="relative border-b border-report-line px-[clamp(24px,5vw,48px)] pb-8 pt-9">
      <div className="absolute inset-x-0 top-0 h-[5px]" style={{ background: brand.color }} aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* The agency logo on white (logos are drawn for white), or its
              initial on the brand colour. */}
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[11px] text-[19px] font-bold"
            style={agencyLogoUrl ? { background: "#FFFFFF", boxShadow: "inset 0 0 0 1px #EEECE8" } : { background: brand.color, color: brand.onFill }}
          >
            {agencyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agencyLogoUrl} alt="" decoding="async" className="max-h-full max-w-full object-contain" />
            ) : (
              (agencyName || "A").charAt(0)
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{agencyName || "Your Agency"}</p>
            {agencyWebsite && <p className="truncate text-[12.5px] text-report-meta">{agencyWebsite}</p>}
          </div>
        </div>
        {badge && (
          <span
            className="whitespace-nowrap rounded-full px-[11px] py-1.5 font-report-mono text-[11px] uppercase tracking-[0.08em]"
            style={{ background: brand.soft, color: brand.ink }}
          >
            {badge}
          </span>
        )}
      </div>

      <h1 className="mt-9 text-[clamp(28px,4vw,40px)] font-bold leading-[1.08] tracking-[-0.035em] [text-wrap:balance]">{title}</h1>

      {/* Who the report is for. The client's mark sits beside their name as
          secondary identity — smaller than the agency logo above it, so it
          never reads as the publisher. Omitted entirely when the client has no
          logo; never substituted. */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-report-muted">
        {clientLogoUrl && (
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-[7px] bg-white shadow-[inset_0_0_0_1px_#EEECE8]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={clientLogoUrl} alt="" decoding="async" className="max-h-full max-w-full object-contain" />
          </span>
        )}
        <span>
          Prepared for <strong className="font-semibold text-report-ink">{clientName}</strong>
        </span>
        {meta.filter(Boolean).map((m) => (
          <span key={m} className="contents">
            <span className="text-report-line-strong" aria-hidden>·</span>
            <span>{m}</span>
          </span>
        ))}
      </div>

      {glance && glance.length > 0 && <GlanceStrip cells={glance} />}
    </div>
  );
}

/** The at-a-glance row: hairline-separated cells, each a measured figure. */
export function GlanceStrip({ cells }: { cells: GlanceCell[] }) {
  return (
    <div className="mt-7 grid gap-px overflow-hidden rounded-[14px] border border-report-line bg-report-line [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
      {cells.map((c) => (
        <div key={c.label} className="bg-white px-[18px] py-4">
          <p className="text-[12.5px] text-report-meta">{c.label}</p>
          <p className="mt-1 text-[26px] font-bold leading-tight tracking-[-0.03em]">{c.value}</p>
          {c.delta && (
            <span
              className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                c.delta.good ? "bg-report-good-bg text-report-good" : "bg-report-bad-soft text-report-bad"
              }`}
            >
              {c.delta.text}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Sections ───────────────────────────────────────────────────────────────

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A numbered section. The id and data-report-* attributes let the contents
 * rail (ReportToc) list exactly the sections that rendered for this report.
 */
export function Section({
  n,
  title,
  subtitle,
  brand,
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  brand: Brand;
  children: React.ReactNode;
}) {
  const num = String(n).padStart(2, "0");
  return (
    <section
      id={`rs-${slug(title)}`}
      data-report-section={num}
      data-report-label={title}
      className="min-w-0 scroll-mt-24 break-inside-avoid"
    >
      <div className="mb-[18px] flex items-baseline gap-3">
        <span className="shrink-0 font-report-mono text-xs" style={{ color: brand.ink }}>{num}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13.5px] text-report-meta">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** A small bold sub-heading inside a section. */
export function SubHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`mb-2.5 text-[13.5px] font-semibold ${className}`}>{children}</p>;
}

/** A quiet explanatory note on the soft fill (coverage, not-available, no-evidence). */
export function Note({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-report-fill px-4 py-3.5 text-[13.5px] leading-[1.55] text-report-secondary ${className}`}>{children}</div>;
}

export type Tone = "good" | "bad" | "watch";

const TONE: Record<Tone, string> = {
  good: "bg-report-good-soft text-report-good",
  bad: "bg-report-bad-soft text-report-bad",
  watch: "bg-report-watch-soft text-report-watch",
};

/** A tinted callout: mono label, one line of measured fact. */
export function Callout({ tone, title, text }: { tone: Tone; title: string; text: string }) {
  return (
    <div className={`rounded-xl px-4 py-3.5 ${TONE[tone]}`}>
      <p className="font-report-mono text-[11px] uppercase tracking-[0.06em]">{title}</p>
      <p className="mt-1.5 text-[14.5px] leading-[1.45] text-report-ink">{text}</p>
    </div>
  );
}

/** A tinted list item (key wins, issues). */
export function ToneTile({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const bg = tone === "good" ? "bg-report-good-soft" : tone === "bad" ? "bg-report-bad-soft" : "bg-report-watch-soft";
  return <li className={`rounded-xl px-3.5 py-3 text-[14.5px] leading-normal text-report-ink ${bg}`}>{children}</li>;
}

// ─── Figures ────────────────────────────────────────────────────────────────

export type Delta = { text: string; good: boolean } | null;

/** 56×22 sparkline. Pass values oriented so "up" is good (negate a lower-is-better series). */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 56;
  const h = 22;
  const pad = 2;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const d = values
    .map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * w).toFixed(1)},${(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** KPI card: label, value (+ sparkline when there is a daily series), delta. */
export function KpiCard({ label, value, delta, spark, brand }: { label: string; value: string; delta?: Delta; spark?: number[] | null; brand: Brand }) {
  return (
    <div className="min-w-0 rounded-xl border border-report-line p-3.5">
      <p className="text-[12.5px] text-report-meta">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className="truncate text-[22px] font-bold leading-tight tracking-[-0.03em]">{value}</span>
        {spark && <Sparkline values={spark} color={brand.color} />}
      </div>
      {delta && (
        <p className={`mt-1.5 text-xs font-semibold ${delta.good ? "text-report-good" : "text-report-bad"}`}>{delta.text}</p>
      )}
    </div>
  );
}

/** A soft stat tile without a delta. */
export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-report-fill px-3.5 py-3">
      <p className="text-xs text-report-meta">{label}</p>
      <p className="mt-1 truncate text-[19px] font-bold tracking-[-0.02em]">{value}</p>
    </div>
  );
}

/** Auto-fitting grid for KPI cards and stat tiles. */
export function TileGrid({ min = 150, children, className = "" }: { min?: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-2.5 ${className}`} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` }}>
      {children}
    </div>
  );
}

// ─── Charts ─────────────────────────────────────────────────────────────────

const axisTick = { fontSize: 10.5, fill: CHART.axis };
// "2026-08-14" → "08-14"; already-short labels pass through.
const shortDate = (d: unknown) => { const t = String(d); return t.length > 5 ? t.slice(5) : t; };
const tooltipStyle = { borderRadius: 10, border: `1px solid ${CHART.tooltipBorder}`, fontSize: 12, fontFamily: "inherit" };

/**
 * A trend card. A dashed previous-period line is drawn only when a previous
 * daily series is supplied; reports today carry previous TOTALS, not days, so
 * the card shows the single series and no legend rather than implying one.
 */
export function TrendCard({
  title,
  total,
  delta,
  data,
  dataKey,
  color,
  previous,
  reversed = false,
}: {
  title: string;
  total?: string;
  delta?: Delta;
  data: { date: string }[];
  dataKey: string;
  color: string;
  previous?: { date: string }[] | null;
  /** Lower is better (average position): flips the axis and draws a line. */
  reversed?: boolean;
}) {
  const id = `rd-${dataKey}-${color.replace(/[^a-z0-9]/gi, "")}`;
  const hasPrev = !!previous && previous.length > 1;
  const merged = hasPrev ? data.map((d, i) => ({ ...d, __prev: (previous![i] as Record<string, unknown> | undefined)?.[dataKey] ?? null })) : data;
  return (
    <div className="min-w-0 rounded-[14px] border border-report-line p-4 [&_.recharts-cartesian-axis-tick_text]:font-report-mono">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13.5px] font-semibold">{title}</span>
        {hasPrev && (
          <span className="flex gap-3 text-[11.5px] text-report-meta">
            <span className="flex items-center gap-1.5"><span className="h-[3px] w-3 rounded-sm" style={{ background: color }} />This period</span>
            <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-[#B9B6AF]" />Previous</span>
          </span>
        )}
      </div>
      {total && (
        <p className="mt-2 text-2xl font-bold tracking-[-0.03em]">
          {total}{" "}
          {delta && (
            <span className={`text-[12.5px] font-semibold tracking-normal ${delta.good ? "text-report-good" : "text-report-bad"}`}>{delta.text}</span>
          )}
        </p>
      )}
      <div className="mt-2 h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          {reversed ? (
            <LineChart data={merged} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tick={axisTick} interval={Math.ceil(data.length / 5)} tickLine={false} axisLine={false} tickFormatter={shortDate} />
              <YAxis reversed tick={axisTick} tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} dot={false} />
            </LineChart>
          ) : (
            <AreaChart data={merged} margin={{ top: 6, right: 6, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tick={axisTick} interval={Math.ceil(data.length / 5)} tickLine={false} axisLine={false} tickFormatter={shortDate} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              {hasPrev && <Line type="monotone" dataKey="__prev" stroke="#B9B6AF" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Previous" />}
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} fill={color} fillOpacity={0.1} id={id} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Breakdowns ─────────────────────────────────────────────────────────────

const pctLabel = (share: number) => `${(share * 100).toFixed(1)}%`;

/** A 10px stacked share bar above one row per item: key, value, share. */
export function ShareBreakdown({
  rows,
  total,
  colors,
  format = (n) => n.toLocaleString(),
  label = (k) => k,
}: {
  rows: { key: string; value: number }[];
  total: number;
  colors: string[];
  format?: (n: number) => string;
  label?: (k: string) => string;
}) {
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-report-line-soft" aria-hidden>
        {rows.map((r, i) => (
          <span key={r.key} style={{ width: `${total > 0 ? (r.value / total) * 100 : 0}%`, background: colors[i % colors.length] }} />
        ))}
      </div>
      <ul className="mt-2.5">
        {rows.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto_64px] gap-3 border-t border-report-line-soft py-[9px] text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: colors[i % colors.length] }} aria-hidden />
              <span className="truncate">{label(r.key)}</span>
            </span>
            <span className="text-right">{format(r.value)}</span>
            <span className="text-right text-report-meta">{total > 0 ? pctLabel(r.value / total) : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A thin 4px share bar under a row. */
export function ThinBar({ share, color }: { share: number; color: string }) {
  return (
    <span className="mt-[7px] block h-1 rounded-sm bg-report-line-soft" aria-hidden>
      <span className="block h-1 rounded-sm" style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: color }} />
    </span>
  );
}

/** Rows of name · value · share with a thin bar under each (audience). */
export function ShareRows({
  rows,
  total,
  brand,
  format = (n) => n.toLocaleString(),
  label = (k) => k,
}: {
  rows: { key: string; value: number }[];
  total: number;
  brand: Brand;
  format?: (n: number) => string;
  label?: (k: string) => string;
}) {
  return (
    <ul>
      {rows.map((r) => {
        const share = total > 0 ? r.value / total : 0;
        return (
          <li key={r.key} className="border-t border-report-line-soft py-[9px] text-sm">
            <div className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{label(r.key)}</span>
              <span className="shrink-0">
                <strong className="font-semibold">{format(r.value)}</strong>{" "}
                <span className="text-report-meta">· {total > 0 ? `${Math.round(share * 100)}%` : "—"}</span>
              </span>
            </div>
            <ThinBar share={share} color={brand.color} />
          </li>
        );
      })}
    </ul>
  );
}

// ─── Tables ─────────────────────────────────────────────────────────────────

/** Shared table classes: no zebra, hairline dividers, right-aligned numerics. */
export const T = {
  wrap: "overflow-x-auto",
  table: "w-full text-sm",
  headRow: "border-b border-report-line-strong text-left text-xs text-report-meta",
  th: "pb-2 pr-3 font-normal last:pr-0",
  thNum: "pb-2 pr-3 text-right font-normal last:pr-0",
  row: "border-b border-report-line-soft",
  td: "py-[11px] pr-3 align-middle last:pr-0",
  tdNum: "py-[11px] pr-3 text-right align-middle last:pr-0",
};

/** Search position as a chip: page-one top 3 green, page one neutral, beyond amber. */
export function PositionChip({ position }: { position: number }) {
  const cls = position <= 3 ? "bg-report-good-bg text-report-good" : position <= 10 ? "bg-report-chip text-report-secondary" : "bg-report-watch-soft text-report-watch";
  return <span className={`inline-block min-w-[38px] rounded-md px-[7px] py-0.5 text-center text-[12.5px] font-semibold ${cls}`}>{position.toFixed(1)}</span>;
}

/** Winning / declining keywords as two tinted panels. */
export function MoversPanels({
  winners,
  decliners,
}: {
  winners: { key: string; pct: number; sub?: string }[];
  decliners: { key: string; pct: number; sub?: string }[];
}) {
  const panel = (title: string, rows: { key: string; pct: number; sub?: string }[], good: boolean) => (
    <div className={`rounded-[14px] p-4 ${good ? "bg-report-good-soft" : "bg-report-bad-soft"}`}>
      <p className={`mb-2 text-[13px] font-semibold ${good ? "text-report-good" : "text-report-bad"}`}>{title}</p>
      <ul>
        {rows.map((k) => (
          <li key={k.key} className={`flex justify-between gap-3 border-t py-2 text-sm ${good ? "border-report-good-line" : "border-report-bad-line"}`}>
            <span className="min-w-0">
              <span className="block truncate">{k.key}</span>
              {k.sub && <span className="block text-[11.5px] text-report-meta">{k.sub}</span>}
            </span>
            <span className={`shrink-0 whitespace-nowrap font-semibold ${good ? "text-report-good" : "text-report-bad"}`}>
              {good ? "▲" : "▼"} {Math.abs(Math.round(k.pct))}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
      {winners.length > 0 && panel("Winning keywords", winners, true)}
      {decliners.length > 0 && panel("Declining keywords", decliners, false)}
    </div>
  );
}

/** "Keywords on the edge of page one": keyword | impressions bar | position. */
export function EdgeKeywords({ rows, brand }: { rows: { key: string; impressions: number; position: number }[]; brand: Brand }) {
  const max = Math.max(1, ...rows.map((r) => r.impressions));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((o) => (
        <li key={o.key} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_auto] items-center gap-3.5 text-sm">
          <span className="truncate">{o.key}</span>
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="relative block h-2.5 min-w-[24px] flex-1 rounded-[5px] bg-report-fill" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-[5px]" style={{ width: `${(o.impressions / max) * 100}%`, background: brand.color }} />
            </span>
            <span className="whitespace-nowrap text-[12.5px] text-report-muted">{o.impressions.toLocaleString()} impr.</span>
          </span>
          <span className="whitespace-nowrap text-right font-report-mono text-xs text-report-watch">pos {o.position.toFixed(1)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Amber idea tile with a mono "IDEA" label. */
export function IdeaTile({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl bg-report-watch-soft px-3.5 py-3 text-[14.5px] leading-normal">
      <span className="pt-[3px] font-report-mono text-[11px] text-report-watch">IDEA</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

// ─── Interpretation & actions ───────────────────────────────────────────────

/** "What this means" card: observation, meaning, and mono chips. */
export function MeaningCard({
  observation,
  meaning,
  metric,
  source,
  confidence,
  confidenceReason,
}: {
  observation: string;
  meaning: string;
  metric: string;
  source: string;
  confidence: string;
  confidenceReason?: string;
}) {
  const high = /^high$/i.test(confidence);
  return (
    <div className="rounded-[14px] border border-report-line px-[18px] py-4">
      <p className="text-[15px] font-semibold">{observation}</p>
      <p className="mt-1.5 text-[14.5px] leading-[1.6] text-report-secondary">{meaning}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="rounded-md bg-report-fill px-2 py-[3px] font-report-mono text-[11px] text-report-muted">{metric}</span>
        <span className="rounded-md bg-report-fill px-2 py-[3px] font-report-mono text-[11px] text-report-muted">{source}</span>
        <span className={`rounded-md px-2 py-[3px] font-report-mono text-[11px] ${high ? "bg-report-good-bg text-report-good" : "bg-report-watch-soft text-report-watch"}`}>
          {confidence} confidence
        </span>
      </div>
      {confidenceReason && <p className="mt-2 text-xs leading-normal text-report-meta">{confidenceReason}</p>}
    </div>
  );
}

/** One bordered list of numbered steps. */
export function StepList({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col overflow-hidden rounded-[14px] border border-report-line">{children}</ol>;
}

const PRIORITY: Record<string, string> = {
  high: "bg-report-watch-bg text-report-watch",
  medium: "bg-report-chip text-report-secondary",
  low: "bg-report-fill text-report-meta",
};

/** A step: brand number dot, the action, an optional "Because" line and priority chip. */
export function StepRow({
  n,
  brand,
  action,
  because,
  priority,
}: {
  n: number;
  brand: Brand;
  action: React.ReactNode;
  because?: React.ReactNode;
  priority?: string;
}) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3.5 border-t border-report-line px-[18px] py-4 first:border-t-0">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: brand.color, color: brand.onFill }}
        aria-hidden
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-medium leading-[1.45]">{action}</p>
        {because && <p className="mt-1 text-[13px] leading-normal text-report-meta">{because}</p>}
      </div>
      {priority ? (
        <span className={`whitespace-nowrap rounded-md px-2 py-1 font-report-mono text-[10.5px] uppercase tracking-[0.06em] ${PRIORITY[priority.toLowerCase().split(" ")[0]] ?? PRIORITY.medium}`}>
          {priority}
        </span>
      ) : (
        <span />
      )}
    </li>
  );
}

/** The agency's note: brand-tinted panel with the agency avatar. */
export function NotePanel({ brand, agencyName, agencyLogoUrl, children }: { brand: Brand; agencyName: string; agencyLogoUrl: string | null; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 rounded-[14px] p-5" style={{ background: brand.soft }}>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full font-bold"
        style={agencyLogoUrl ? { background: "#FFFFFF" } : { background: brand.color, color: brand.onFill }}
      >
        {agencyLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={agencyLogoUrl} alt="" decoding="async" className="max-h-full max-w-full object-contain" />
        ) : (
          (agencyName || "A").charAt(0)
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15.5px] leading-[1.6] text-report-body [overflow-wrap:anywhere]">{children}</div>
        <p className="mt-2 text-[13px] text-report-meta">{agencyName || "Your Agency"}</p>
      </div>
    </div>
  );
}

/** Prepared by / website, on a hairline. */
export function ReportFooter({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-3 border-t border-report-line pt-5 text-[12.5px] text-report-meta">
      {/* The left side can be the agency's own footer text, which may be long,
          so only the website stays on one line. */}
      <span className="min-w-0">{left}</span>
      {right && <span className="whitespace-nowrap">{right}</span>}
    </div>
  );
}

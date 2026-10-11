// Anavyst logo — "dog-ear report": a report page with its corner turned and a
// trend line climbing to one amber insight point. The wordmark is live text in
// currentColor so it follows the theme. Both scale with the wrapper's font size
// (className "text-lg" etc.).
//
// The tile follows the theme: ink on light surfaces, reversed to a cream tile
// with an ink line on dark ones (the approved 2a pair), so the mark never sinks
// into a dark rail. `reversed` pins the cream version for a dark band inside a
// light page (the site footer). Colours are the --mark-* tokens in globals.css.
// Public API unchanged: BrandMark({ className }) and Brand({ className }).
const TILE = "M11 0H34L48 14V37A11 11 0 0 1 37 48H11A11 11 0 0 1 0 37V11A11 11 0 0 1 11 0Z";
const FOLD = "M34 0V9A5 5 0 0 0 39 14H48Z";
const TREND = "12,34 20,24 26,29 35,19";

export function BrandMark({ className = "h-7 w-7", reversed = false }: { className?: string; reversed?: boolean }) {
  const tile = reversed ? "rgb(var(--mark-cream))" : "rgb(var(--mark-tile))";
  const line = reversed ? "rgb(var(--mark-ink))" : "rgb(var(--mark-line))";
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">
      <path d={TILE} style={{ fill: tile }} />
      <path d={FOLD} style={{ fill: "rgb(var(--mark-fold))" }} />
      <polyline
        points={TREND}
        fill="none"
        style={{ stroke: line }}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="35" cy="19" r="3.4" style={{ fill: "rgb(var(--mark-dot))" }} />
    </svg>
  );
}

export function Brand({ className = "", reversed = false }: { className?: string; reversed?: boolean }) {
  return (
    <span
      role="img"
      aria-label="Anavyst"
      className={`inline-flex items-center gap-[0.45em] ${reversed ? "text-site-dark-fg" : "text-ink-900"} ${className}`}
    >
      <BrandMark className="h-[1.75em] w-[1.75em]" reversed={reversed} />
      <span
        aria-hidden="true"
        className="text-[1.4em] font-bold leading-none tracking-[-0.045em]"
        style={{ fontFamily: "var(--font-brand), ui-sans-serif, system-ui, sans-serif" }}
      >
        anavyst
      </span>
    </span>
  );
}

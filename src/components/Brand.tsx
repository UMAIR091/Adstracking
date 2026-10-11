// Anavyst logo — "Live A": four rounded bars stack into an "A" (a bar chart on
// its side). The lower bars use currentColor so the mark follows the theme
// (ink on light, cream on dark); the top bar is the brand accent, read from the
// --mark-accent token (teal on light, the app icon's green on dark).
// Wordmark: "anavyst" in Unbounded 600 (loaded in app/layout.tsx as --font-brand).
// `reversed` pins the on-dark version for a dark band inside a light page (the
// site footer).
// Public API unchanged: BrandMark({ className }) and Brand({ className }).
// New: BrandLoader — the animated mark for loading / report-generating states.

const TOP = { x: 17.5, y: 6, width: 13, height: 9, rx: 4.5 };
const BARS = [
  { x: 10.5, y: 19.5, width: 27, height: 9, rx: 4.5, origin: "center" },
  { x: 3.5, y: 33, width: 16, height: 9, rx: 4.5, origin: "right center" },
  { x: 28.5, y: 33, width: 16, height: 9, rx: 4.5, origin: "left center" },
] as const;

const accent = (reversed: boolean) => (reversed ? "rgb(var(--mark-accent-on-dark))" : "rgb(var(--mark-accent))");

export function BrandMark({ className = "h-7 w-7", reversed = false }: { className?: string; reversed?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">
      <rect {...TOP} style={{ fill: accent(reversed) }} />
      {BARS.map(({ origin, ...b }) => (
        <rect key={b.x} {...b} fill="currentColor" />
      ))}
    </svg>
  );
}

export function Brand({ className = "", reversed = false }: { className?: string; reversed?: boolean }) {
  return (
    <span
      role="img"
      aria-label="Anavyst"
      className={`inline-flex items-center gap-[0.5em] ${reversed ? "text-site-dark-fg" : "text-ink-900"} ${className}`}
    >
      <BrandMark className="h-[1.6em] w-[1.6em]" reversed={reversed} />
      <span
        aria-hidden="true"
        className="text-[1.2em] font-semibold leading-none tracking-[-0.04em]"
        style={{ fontFamily: "var(--font-brand), ui-sans-serif, system-ui, sans-serif" }}
      >
        anavyst
      </span>
    </span>
  );
}

// Animated mark: bars build like a chart rendering, then the top bar lands.
// Keyframes live in globals.css (av-bar / av-top); prefers-reduced-motion
// shows the static mark. Use for route loading.tsx files and the
// "generating report" state — not as a replacement for BrandMark in chrome.
export function BrandLoader({ className = "h-10 w-10", label = "Loading" }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 text-ink-900 ${className}`} role="status" aria-label={label}>
      {BARS.map(({ origin, ...b }, i) => (
        <rect
          key={b.x}
          {...b}
          fill="currentColor"
          className="av-bar"
          style={{ transformOrigin: origin, animationDelay: `${i === 0 ? 0.15 : 0.35}s` }}
        />
      ))}
      <rect {...TOP} className="av-top" style={{ fill: accent(false), animationDelay: "0.6s" }} />
    </svg>
  );
}

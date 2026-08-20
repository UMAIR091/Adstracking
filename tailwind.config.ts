import type { Config } from "tailwindcss";

// Every scale resolves to a CSS variable defined in globals.css, so the palette
// lives in one file and components never carry a literal hex.
//
// The built-in `slate`, `emerald`, `amber`, `red`, `rose`, `sky`, `blue`,
// `cyan`, `indigo` and `violet` names are deliberately REMAPPED onto the same
// token set. Components across the app already use them for neutrals and status
// states; pointing them at tokens re-themes every one of those usages at once
// instead of rewriting ~500 class names by hand — and it stops a stray literal
// Tailwind colour from reintroducing the old bright-purple palette.
const withAlpha = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const ink = {
  50: withAlpha("--ink-50"),
  100: withAlpha("--ink-100"),
  200: withAlpha("--ink-200"),
  300: withAlpha("--ink-300"),
  400: withAlpha("--ink-400"),
  500: withAlpha("--ink-500"),
  600: withAlpha("--ink-600"),
  700: withAlpha("--ink-700"),
  800: withAlpha("--ink-800"),
  900: withAlpha("--ink-900"),
  950: withAlpha("--ink-900"),
};

// Status scales share a shape: 50/100 soft fills, 500 the dot/marker,
// 600/700 text and filled buttons. Intermediate stops are filled in so any
// pre-existing class still resolves to something sensible.
const status = (name: string) => ({
  50: withAlpha(`--${name}-50`),
  100: withAlpha(`--${name}-100`),
  200: withAlpha(`--${name}-100`),
  300: withAlpha(`--${name}-500`),
  400: withAlpha(`--${name}-500`),
  500: withAlpha(`--${name}-500`),
  600: withAlpha(`--${name}-600`),
  700: withAlpha(`--${name}-700`),
  800: withAlpha(`--${name}-700`),
  900: withAlpha(`--${name}-700`),
  // `600` is the icon/text tone and flips light on the dark theme, which is
  // right for the ~100 places that use it as a colour ON a tinted fill — and
  // wrong for the handful that fill a button with it and put white text on
  // top. Those read `solid`, which stays deep enough for white text in both
  // themes. Falls back to the -600/-700 values where a status defines none, so
  // nothing changes for the statuses that never fill anything.
  solid: withAlpha(`--${name}-solid, var(--${name}-600)`),
  "solid-hover": withAlpha(`--${name}-solid-hover, var(--${name}-700)`),
});

const brand = {
  // Filled surfaces carrying white text. Split from `500` because the dark
  // theme's accent is a touch light for white body text; everything that uses
  // indigo AS A COLOUR (links, active nav, selection, icons) still reads `500`.
  solid: withAlpha("--brand-solid"),
  "solid-hover": withAlpha("--brand-solid-hover"),
  50: withAlpha("--brand-50"),
  100: withAlpha("--brand-100"),
  200: withAlpha("--brand-200"),
  300: withAlpha("--brand-300"),
  400: withAlpha("--brand-400"),
  500: withAlpha("--brand-500"),
  600: withAlpha("--brand-600"),
  700: withAlpha("--brand-700"),
  800: withAlpha("--brand-800"),
  900: withAlpha("--brand-800"),
};

// Restrained blue-violet. Used for secondary accents and one chart series —
// never for primary actions, which stay on `brand`.
const accent = {
  400: withAlpha("--accent-400"),
  500: withAlpha("--accent-500"),
  600: withAlpha("--accent-600"),
};

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand,
        accent,
        ink,
        // Neutrals used interchangeably with `ink` across the app.
        slate: ink,
        gray: ink,
        neutral: ink,
        zinc: ink,
        surface: {
          DEFAULT: withAlpha("--surface"),
          muted: withAlpha("--surface-muted"),
          subtle: withAlpha("--surface-subtle"),
          band: withAlpha("--surface-band"),
        },
        // The nav rail sits a step away from both the page and a card, so it
        // gets its own token rather than borrowing one of theirs.
        sidebar: withAlpha("--sidebar"),
        // Fixed-polarity colours. The neutral ramp inverts between themes, so
        // `ink-900/40` is a black scrim in light and a white one in dark —
        // these stay dark-on-light and light-on-dark by definition.
        overlay: withAlpha("--overlay"),
        inverse: {
          DEFAULT: withAlpha("--inverse"),
          fg: withAlpha("--inverse-fg"),
        },
        // Semantic status tokens — prefer these in new code.
        success: status("success"),
        warning: status("warning"),
        danger: status("danger"),
        info: status("info"),
        // Literal hue names already in use, mapped onto the same tokens.
        emerald: status("success"),
        green: status("success"),
        teal: status("success"),
        amber: status("warning"),
        yellow: status("warning"),
        orange: status("warning"),
        red: status("danger"),
        rose: status("danger"),
        pink: status("danger"),
        sky: status("info"),
        blue: status("info"),
        cyan: status("info"),
        // Accent-adjacent hues resolve to the brand ramp so nothing drifts
        // back toward the old bright purple.
        indigo: brand,
        violet: brand,
        purple: brand,
        fuchsia: brand,
        chart: {
          1: withAlpha("--chart-1"),
          2: withAlpha("--chart-2"),
          3: withAlpha("--chart-3"),
          4: withAlpha("--chart-4"),
          5: withAlpha("--chart-5"),
          6: withAlpha("--chart-6"),
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      borderRadius: {
        // Tightened: large radii read as consumer app, not analytics tool.
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        // Shallow and layered, cast in obsidian rather than a blue-black.
        // Elevation comes from borders and surface contrast first, shadow
        // second — big soft shadows read as cheap, and on the dark theme they
        // are nearly invisible by design.
        xs: "0 1px 2px 0 rgb(9 9 11 / 0.04)",
        sm: "0 1px 2px 0 rgb(9 9 11 / 0.05), 0 1px 3px 0 rgb(9 9 11 / 0.04)",
        DEFAULT: "0 1px 2px 0 rgb(9 9 11 / 0.05), 0 1px 3px 0 rgb(9 9 11 / 0.04)",
        md: "0 2px 6px -1px rgb(9 9 11 / 0.07), 0 1px 3px -1px rgb(9 9 11 / 0.05)",
        lg: "0 8px 20px -6px rgb(9 9 11 / 0.10), 0 3px 8px -3px rgb(9 9 11 / 0.05)",
        xl: "0 18px 36px -10px rgb(9 9 11 / 0.15)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        // Fast and restrained — polish, not performance.
        "fade-in": "fade-in 0.2s ease-out both",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
};

export default config;

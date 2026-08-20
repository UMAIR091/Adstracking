// The one place that knows how a theme choice is stored and applied.
//
// Three states, not two: Light and Dark are explicit choices, System means
// "keep following the OS", which is what the app did before a toggle existed
// and remains the default. Only an explicit choice is persisted; System clears
// the key, so a user who picks it goes back to tracking their OS forever
// rather than being pinned to whatever it happened to be that day.
//
// Applying a theme = one attribute on <html>. The palettes in globals.css hang
// off `:root[data-theme="dark"]` and `:root:not([data-theme="light"])` inside
// the prefers-color-scheme query, so setting the attribute re-colours the whole
// interface synchronously, with no re-render and no per-component wiring.
//
// public/theme.js replays this at boot, before first paint. The storage key and
// the accepted values must match there.

export const THEME_STORAGE_KEY = "reportflow-theme";

/**
 * The boot snippet, for surfaces that must apply the theme before first paint.
 *
 * public/theme.js is the same logic as a static file, which is what the
 * marketing pages load — their CSP allows `script-src 'self'`. The dashboard's
 * CSP carries 'strict-dynamic', which makes the browser ignore 'self' and
 * 'unsafe-inline' entirely, so there it has to be inlined with the request
 * nonce instead. Same behaviour, two delivery mechanisms, because the two
 * policies allow different things.
 */
export const THEME_BOOT_SCRIPT =
  `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export type ThemeChoice = "light" | "dark" | "system";

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "light" || v === "dark" || v === "system";
}

/** What the user has chosen. "system" when nothing is stored. */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/** The theme actually on screen for a given choice. */
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Writes the choice to <html> and to storage. Safe to call repeatedly. */
export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);

  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* Storage blocked — the theme still applies for this session. */
  }
}

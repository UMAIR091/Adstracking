/* Applies the saved theme before first paint.
 *
 * Deliberately a static file rather than an inline <script>: the dashboard is
 * served under a strict nonce'd CSP, and reading the per-request nonce in the
 * root layout would force every static marketing page to render dynamically.
 * `script-src 'self'` covers this in both policies.
 *
 * Keep in sync with lib/theme.ts — the storage key and the accepted values.
 */
(function () {
  try {
    var t = window.localStorage.getItem("reportflow-theme");
    if (t === "dark" || t === "light") {
      document.documentElement.setAttribute("data-theme", t);
    }
    // "system" (or nothing stored) leaves the attribute off, so the
    // prefers-color-scheme rules in globals.css decide.
  } catch (e) {
    /* Private mode or blocked storage — fall back to the system preference. */
  }
})();

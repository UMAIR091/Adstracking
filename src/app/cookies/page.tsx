import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/LegalShell";
import { COMPANY, LEGAL_LAST_UPDATED } from "@/lib/company";

export const metadata: Metadata = {
  title: `Cookie Policy — ${COMPANY.product}`,
  description: `How ${COMPANY.product} uses cookies.`,
};

export default function CookiesPage() {
  return (
    <LegalShell
      title="Cookie Policy"
      subtitle="We use only the cookies needed to sign you in — no advertising or cross-site tracking."
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <h2>What cookies we use</h2>
      <p>
        {COMPANY.product} sets only <strong>strictly necessary</strong> first-party cookies. We do not use advertising
        cookies, cross-site trackers, or third-party analytics cookies.
      </p>
      <table>
        <thead>
          <tr><th>Cookie</th><th>Purpose</th><th>Duration</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase auth session (<code>sb-*</code>)</td>
            <td>Keeps you signed in to your dashboard</td>
            <td>Session / refreshed while you use the app</td>
          </tr>
          <tr>
            <td><code>oauth_nonce</code></td>
            <td>Protects the integration-connection flow against cross-site request forgery</td>
            <td>Minutes — deleted once the connection completes</td>
          </tr>
        </tbody>
      </table>

      <h2>Because we only use essential cookies</h2>
      <ul>
        <li>No cookie-consent banner is required in most jurisdictions — the service cannot function without these cookies.</li>
        <li>Blocking them in your browser will prevent you from signing in.</li>
        <li>Public report links (<code>/r/…</code>) work without any sign-in cookie.</li>
      </ul>

      <h2>Third-party services</h2>
      <p>
        When you check out, our payment provider (Paddle) may set its own cookies on its checkout pages, and
        Google may set cookies during Google sign-in on its own domains — each governed by their own policies.
      </p>

      <h2>Questions</h2>
      <p>
        See the <Link href="/privacy">Privacy Policy</Link> or contact{" "}
        <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>.
      </p>
    </LegalShell>
  );
}

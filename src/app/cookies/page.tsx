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
      subtitle="Essential cookies to sign you in, plus analytics and ad measurement on our own website — never on your clients' reports."
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <h2>Strictly necessary cookies</h2>
      <p>These are needed for the service to work, so they can&apos;t be switched off.</p>
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
          <tr>
            <td><code>av_cc</code></td>
            <td>Your country (from your IP address), so we can leave ad measurement off where it needs prior consent</td>
            <td>1 day</td>
          </tr>
        </tbody>
      </table>

      <h2>Analytics and advertising measurement</h2>
      <p>
        On our own website we measure visits and which of our ads bring people to {COMPANY.product}. These cookies are
        never set on client report links (<code>/r/…</code>), and none of them involve your connected marketing data.
      </p>
      <table>
        <thead>
          <tr><th>Cookie</th><th>Set by</th><th>Purpose</th><th>Duration</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>_ga</code>, <code>_ga_*</code></td>
            <td>Google Analytics 4</td>
            <td>Counts visits and page views on our website</td>
            <td>Up to 2 years</td>
          </tr>
          <tr>
            <td><code>_fbp</code>, <code>_fbc</code></td>
            <td>Meta Pixel</td>
            <td>
              Measures whether visits from our Meta ads lead to sign-ups, trials and payments. Only on our marketing
              pages, signup and billing.
            </td>
            <td>90 days</td>
          </tr>
        </tbody>
      </table>
      <ul>
        <li>
          The Meta Pixel is not loaded for visitors in the European Economic Area, the United Kingdom or Switzerland, or in
          browsers that send a Global Privacy Control signal.
        </li>
        <li>
          To opt out, turn on Global Privacy Control, block third-party cookies or scripts in your browser, or use the ad
          preferences in your Facebook or Instagram settings. Blocking these cookies does not affect how the app works.
        </li>
        <li>
          How the ad measurement works, including what we send to Meta when you pay, is described in section 5 of our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </li>
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

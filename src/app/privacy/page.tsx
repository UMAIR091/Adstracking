import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/LegalShell";
import { COMPANY, DATA_PROMISE, LEGAL_LAST_UPDATED } from "@/lib/company";

export const metadata: Metadata = {
  title: `Privacy Policy — ${COMPANY.product}`,
  description: `How ${COMPANY.product} collects, uses, and protects your data.`,
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      subtitle={DATA_PROMISE}
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <p>
        This Privacy Policy explains how {COMPANY.legalName} (&quot;{COMPANY.product}&quot;, &quot;we&quot;,
        &quot;us&quot;) collects, uses, stores, and protects information when you use {COMPANY.product} — a
        white-label client-reporting platform for marketing agencies. By using the service you agree to this policy.
      </p>

      <h2>1. Information we collect</h2>
      <h3>Account information</h3>
      <ul>
        <li>Your name, email address, and password (or Google sign-in identity) when you create an account.</li>
        <li>Agency branding you provide: agency name, logo, brand colour, website, and contact details.</li>
      </ul>
      <h3>Client information you add</h3>
      <ul>
        <li>Names, email addresses, and websites of the clients you create reports for.</li>
      </ul>
      <h3>Connected marketing data</h3>
      <p>
        When you connect a data source (such as Google Search Console, Google Analytics 4, or Meta Ads), we access —
        with your explicit authorization via OAuth — the reporting metrics needed to build your reports, for example
        clicks, impressions, search queries, sessions, engagement, conversions, ad spend, and campaign performance.
        We store periodic snapshots of these aggregated metrics so your reports load quickly and reliably.
      </p>
      <h3>Usage information</h3>
      <ul>
        <li>Basic technical logs (such as request logs and error reports) needed to operate and secure the service.</li>
      </ul>

      <h2>2. How we use your information</h2>
      <ul>
        <li>To generate, schedule, and deliver the client reports you request.</li>
        <li>To produce AI-written report summaries from your aggregated marketing metrics.</li>
        <li>To operate, secure, and improve the service, and to provide customer support.</li>
        <li>To process your subscription payments (handled by our payment provider).</li>
      </ul>
      <p>
        <strong>{DATA_PROMISE}</strong> We do not use your data to train AI models, we do not sell it to data brokers,
        and we do not use it for advertising.
      </p>

      <h2>3. Google API Services — Limited Use disclosure</h2>
      <p>
        {COMPANY.product}&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Specifically:
      </p>
      <ul>
        <li>Google user data is used only to provide the reporting features you see in the app — never for advertising, never sold, and never used to train AI models.</li>
        <li>Data is transferred to third parties only as necessary to provide these features (see subprocessors below), to comply with law, or with your explicit consent.</li>
        <li>Humans do not read your Google data except with your permission for support, for security purposes, or as required by law.</li>
      </ul>

      <h2>4. Meta Platform data</h2>
      <p>
        When you connect Meta Ads, we access ad-account performance metrics through the Meta Marketing API in accordance
        with the <a href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer">Meta Platform Terms</a>.
        The same rules apply: metrics are used only to build your reports, and you can disconnect and delete the stored
        data at any time.
      </p>

      <h2>5. How we store and protect data</h2>
      <ul>
        <li>All data is transmitted over encrypted connections (TLS/HTTPS).</li>
        <li>OAuth access and refresh tokens are encrypted at rest with AES-256-GCM before being stored.</li>
        <li>Data is stored with row-level security so each agency can only ever access its own records.</li>
        <li>We never receive or store your Google or Meta account passwords — connections use OAuth.</li>
      </ul>
      <p>
        See our <Link href="/security">Data Processing &amp; Security</Link> page for full details, including our
        subprocessor list.
      </p>

      <h2>6. Data retention and deletion</h2>
      <ul>
        <li>Connected-source snapshots are kept only while the data source stays connected.</li>
        <li>
          You can disconnect any integration at any time from your dashboard — this immediately deletes the stored
          OAuth tokens and all cached metric snapshots for that source.
        </li>
        <li>Generated reports remain until you delete them or your account.</li>
        <li>
          To delete your entire account and all associated data, contact us at{" "}
          <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>. We complete deletion requests within
          30 days.
        </li>
      </ul>
      <p>
        Step-by-step instructions are on our <Link href="/data-deletion">Data Deletion Request</Link> page.
      </p>

      <h2>7. Sharing and subprocessors</h2>
      <p>
        We share data only with the infrastructure providers required to run the service (hosting, database, email
        delivery, AI summaries, and payments), each bound by their own data-protection terms. The current list is
        maintained on our <Link href="/security">Data Processing &amp; Security</Link> page. We never sell personal
        data.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Depending on your location, you may have the right to access, correct, export, or delete your personal data,
        and to object to or restrict certain processing. To exercise any of these rights, email{" "}
        <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>.
      </p>

      <h2>9. Children</h2>
      <p>{COMPANY.product} is a business tool and is not directed at children under 16. We do not knowingly collect data from children.</p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. Material changes will be announced in the app or by email. The
        &quot;Last updated&quot; date above always reflects the current version.
      </p>

      <h2>11. Contact</h2>
      <p>
        {COMPANY.legalName}, {COMPANY.address}. Privacy questions:{" "}
        <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a> · General support:{" "}
        <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>.
      </p>
    </LegalShell>
  );
}

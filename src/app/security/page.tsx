import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/LegalShell";
import { COMPANY, DATA_PROMISE, LEGAL_LAST_UPDATED } from "@/lib/company";

export const metadata: Metadata = {
  title: `Data Processing & Security — ${COMPANY.product}`,
  description: `How ${COMPANY.product} processes, stores, and secures your data.`,
};

export default function SecurityPage() {
  return (
    <LegalShell
      title="Data Processing & Security"
      subtitle="What we access, where it lives, and how it is protected."
      lastUpdated={LEGAL_LAST_UPDATED}
    >
      <h2>What data flows through {COMPANY.product}</h2>
      <p>
        {COMPANY.product} connects to the marketing platforms you authorize and stores periodic snapshots of
        <strong> aggregated reporting metrics</strong> — never your platform passwords, and never more than what the
        reports need.
      </p>
      <table>
        <thead>
          <tr><th>Source</th><th>Data accessed</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Google Search Console</td>
            <td>Clicks, impressions, CTR, positions, queries, pages, countries, devices (read-only)</td>
            <td>SEO sections of your reports</td>
          </tr>
          <tr>
            <td>Google Analytics 4</td>
            <td>Users, sessions, engagement, conversions, revenue, landing pages, channels (read-only)</td>
            <td>Website-performance sections of your reports</td>
          </tr>
          <tr>
            <td>Meta Ads</td>
            <td>Spend, impressions, clicks, CPC, reach, conversions, campaign performance (read-only)</td>
            <td>Paid-media sections of your reports</td>
          </tr>
        </tbody>
      </table>
      <p>
        All connections use <strong>read-only OAuth scopes</strong>. {COMPANY.product} cannot change anything in your
        Google or Meta accounts.
      </p>

      <h2>Security measures</h2>
      <ul>
        <li><strong>Encryption in transit:</strong> all traffic uses TLS/HTTPS.</li>
        <li><strong>Token encryption at rest:</strong> OAuth access and refresh tokens are encrypted with AES-256-GCM before storage; the encryption key is held outside the database.</li>
        <li><strong>Row-level security:</strong> every table enforces database-level policies so an agency can only read or write its own rows.</li>
        <li><strong>Tenant isolation:</strong> reports, clients, data sources, and snapshots are all scoped to your agency workspace.</li>
        <li><strong>No password storage:</strong> platform connections use OAuth only; sign-in uses Supabase Auth (hashed passwords or Google sign-in).</li>
        <li><strong>Least-privilege processing:</strong> scheduled syncs and report generation run server-side with scoped credentials.</li>
      </ul>

      <h2>Subprocessors</h2>
      <p>We rely on these infrastructure providers to operate the service:</p>
      <table>
        <thead>
          <tr><th>Provider</th><th>Role</th><th>Data involved</th></tr>
        </thead>
        <tbody>
          <tr><td>Supabase</td><td>Database, authentication &amp; file storage</td><td>Account, client, and snapshot data; uploaded logos</td></tr>
          <tr><td>Vercel</td><td>Application hosting</td><td>Request traffic and server logs</td></tr>
          <tr><td>Google</td><td>Search Console / Analytics APIs, sign-in</td><td>Metrics you authorize; sign-in identity</td></tr>
          <tr><td>Meta</td><td>Marketing API</td><td>Ad metrics you authorize</td></tr>
          <tr><td>Anthropic</td><td>AI report summaries</td><td>Aggregated metrics for the report being generated (not used for model training)</td></tr>
          <tr><td>Resend</td><td>Email delivery</td><td>Recipient addresses and report emails</td></tr>
          <tr><td>Lemon Squeezy</td><td>Payments (merchant of record)</td><td>Billing details you provide at checkout</td></tr>
        </tbody>
      </table>

      <h2>Data retention &amp; deletion</h2>
      <ul>
        <li>Metric snapshots exist only while the data source is connected.</li>
        <li>
          <strong>Disconnecting an integration immediately deletes</strong> its stored OAuth tokens and every cached
          snapshot for that source (database-level cascade). You can do this per client, or from{" "}
          <Link href="/dashboard/settings/data">Settings → Data &amp; privacy</Link>.
        </li>
        <li>Generated reports persist until you delete them.</li>
        <li>Full account deletion: email <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a> — completed within 30 days.</li>
        <li>Step-by-step instructions: <Link href="/data-deletion">Data Deletion Request</Link>.</li>
      </ul>

      <h2>Incident response</h2>
      <p>
        If we become aware of a security incident affecting your data, we will investigate promptly and notify affected
        customers without undue delay, along with the steps we are taking. Report suspected vulnerabilities to{" "}
        <a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>.
      </p>

      <h2>Our commitment</h2>
      <p><strong>{DATA_PROMISE}</strong></p>
      <p>
        Questions? See the <Link href="/privacy">Privacy Policy</Link> or write to{" "}
        <a href={`mailto:${COMPANY.privacyEmail}`}>{COMPANY.privacyEmail}</a>.
      </p>
    </LegalShell>
  );
}

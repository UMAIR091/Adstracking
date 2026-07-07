import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/LegalShell";
import { COMPANY, DATA_PROMISE } from "@/lib/company";

export const metadata: Metadata = {
  title: `About — ${COMPANY.product}`,
  description: `What ${COMPANY.product} is and why it exists.`,
};

export default function AboutPage() {
  return (
    <LegalShell title={`About ${COMPANY.product}`} subtitle="Client reporting that used to take hours, done in minutes.">
      <h2>Why we built this</h2>
      <p>
        Every agency knows the monthly ritual: export screenshots, paste charts into a deck, write the same summary
        paragraphs, send, repeat — for every client. Reporting tools that fix this either charge per client (so
        growing hurts) or take weeks to set up.
      </p>
      <p>
        {COMPANY.product} takes the opposite approach: <strong>every feature on every plan, simple pricing, zero setup</strong>.
        Connect a client&apos;s data sources once, and beautiful white-label reports — with AI-written executive
        summaries — go out on schedule, under your brand, from your domain. Your clients never see our name.
      </p>

      <h2>What it does</h2>
      <ul>
        <li>Pulls SEO, analytics, and ad-platform metrics from the sources you connect (read-only).</li>
        <li>Writes the executive summary, wins, issues, and recommendations with AI — grounded in your real numbers.</li>
        <li>Delivers branded reports as live links and PDF attachments, weekly, monthly, or quarterly.</li>
      </ul>

      <h2>What we believe</h2>
      <ul>
        <li><strong>Your data is yours.</strong> {DATA_PROMISE}</li>
        <li><strong>Fewer features, done well.</strong> We deliberately build the 5% of features agencies use every week — and polish them.</li>
        <li><strong>Your brand, not ours.</strong> White-label means invisible. We stay out of your client relationships.</li>
      </ul>

      <h2>The company</h2>
      <p>
        {COMPANY.product} is built by {COMPANY.legalName}. Questions or ideas? We&apos;d love to hear from you —{" "}
        <Link href="/contact">get in touch</Link>.
      </p>
    </LegalShell>
  );
}

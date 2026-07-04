import type { Metadata } from "next";
import Link from "next/link";
import { Mail, ShieldCheck, LifeBuoy } from "lucide-react";
import { LegalShell } from "@/components/LegalShell";
import { Card, CardContent } from "@/components/ui/card";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: `Contact & Support — ${COMPANY.product}`,
  description: `Get help with ${COMPANY.product}.`,
};

const CHANNELS = [
  {
    icon: LifeBuoy,
    title: "Product support",
    text: "Questions, bugs, or help getting set up. We reply within 1 business day.",
    email: COMPANY.supportEmail,
  },
  {
    icon: ShieldCheck,
    title: "Privacy & data requests",
    text: "Data access, export, or deletion requests, and privacy questions.",
    email: COMPANY.privacyEmail,
  },
  {
    icon: Mail,
    title: "Everything else",
    text: "Partnerships, feedback, or anything that doesn't fit above.",
    email: COMPANY.supportEmail,
  },
];

export default function ContactPage() {
  return (
    <LegalShell title="Contact & Support" subtitle="We're a small team and we read everything.">
      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CHANNELS.map((c) => (
          <Card key={c.title}>
            <CardContent className="p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <c.icon size={18} />
              </div>
              <p className="mt-3 font-semibold text-ink-900">{c.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">{c.text}</p>
              <a href={`mailto:${c.email}`} className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
                {c.email}
              </a>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2>Before you write in</h2>
      <ul>
        <li>Connection problems? Try disconnecting and reconnecting the integration from the client&apos;s page.</li>
        <li>Report data looks stale? Use <strong>Refresh now</strong> on the data source — automatic syncs run every few hours.</li>
        <li>Managing your stored data? See <Link href="/dashboard/settings/data">Settings → Data &amp; privacy</Link>.</li>
      </ul>

      <h2>Company details</h2>
      <p>
        {COMPANY.legalName}
        <br />
        {COMPANY.address}
      </p>
    </LegalShell>
  );
}

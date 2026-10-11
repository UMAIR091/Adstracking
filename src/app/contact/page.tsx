import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Eyebrow, sitePage } from "@/components/site/ui";

export const metadata: Metadata = {
  title: `Contact & Support — ${COMPANY.product}`,
  description: `Get help with ${COMPANY.product}.`,
};

const CHANNELS = [
  {
    title: "Product support",
    text: "Questions, bugs, or help getting set up. We reply within 1 business day.",
    email: COMPANY.supportEmail,
  },
  {
    title: "Privacy & data requests",
    text: "Data access, export, or deletion requests, and privacy questions.",
    email: COMPANY.privacyEmail,
  },
  {
    title: "Everything else",
    text: "Partnerships, feedback, or anything that doesn't fit above.",
    email: COMPANY.supportEmail,
  },
];

const TIPS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Connection problems?",
    a: <>Try disconnecting and reconnecting the integration from the client&apos;s page.</>,
  },
  {
    q: "Report data looks stale?",
    a: (
      <>
        Use <strong className="font-semibold text-site-fg">Refresh now</strong> on the data source — automatic syncs run
        every few hours.
      </>
    ),
  },
  {
    q: "Managing your stored data?",
    a: (
      <>
        See{" "}
        <Link href="/dashboard/settings/data" className="font-semibold text-site-fg underline hover:text-site-accent">
          Settings → Data &amp; privacy
        </Link>
        .
      </>
    ),
  },
];

export default function ContactPage() {
  return (
    <div className={`${sitePage} flex flex-col`}>
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 pb-[96px] pt-16 sm:pt-20 lg:pb-[110px]">
        <Eyebrow className="!mb-[18px]">Contact &amp; Support</Eyebrow>
        <h1 className="max-w-[820px] text-[clamp(40px,6vw,72px)] font-extrabold leading-none tracking-[-0.045em] [text-wrap:balance]">
          We&apos;re a small team and we read everything.
        </h1>

        <div className="mt-14 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
          {CHANNELS.map((c) => (
            <div key={c.title} className="flex flex-col gap-2.5 rounded-[18px] bg-site-band p-7">
              <h2 className="text-xl font-bold">{c.title}</h2>
              <p className="flex-1 leading-[1.55] text-site-muted">{c.text}</p>
              <a href={`mailto:${c.email}`} className="mt-2.5 font-semibold text-site-accent hover:underline">
                {c.email}
              </a>
            </div>
          ))}
        </div>

        <div className="mt-16 border-t border-site-line-strong pt-9">
          <h2 className="mb-5 text-[26px] font-bold tracking-[-0.03em]">Before you write in</h2>
          <ul className="flex flex-col gap-3.5">
            {TIPS.map((t) => (
              <li key={t.q} className="flex flex-wrap gap-x-3.5 gap-y-1 text-base leading-[1.55]">
                <span className="min-w-[220px] shrink-0 font-bold">{t.q}</span>
                <span className="text-site-muted">{t.a}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

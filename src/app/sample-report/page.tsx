import type { Metadata } from "next";
import Link from "next/link";
import { ReportPreview } from "@/components/ReportPreview";
import { ReportToc } from "@/components/report/ReportToc";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { siteFonts } from "@/lib/siteFonts";

export const metadata: Metadata = {
  title: "Sample client report — Anavyst",
  description:
    "A real example of the white-label SEO & analytics report Anavyst generates and sends for you — AI-written insights, your branding, delivered on schedule.",
};

// Public sample report — the strongest sales asset we have. Anonymous visitors
// land here from the marketing page CTA (the in-app preview is login-walled).
export default function SampleReportPage() {
  return (
    <div className={`${siteFonts} site-root flex min-h-screen flex-col bg-site-band font-site text-site-fg`}>
      <SiteHeader />

      <main className="w-full flex-1">
        <section className="mx-auto max-w-[760px] px-6 pb-9 pt-14 text-center">
          <p className="font-site-mono text-xs uppercase tracking-[0.08em] text-site-accent">Sample report</p>
          <h1 className="mt-3 text-[clamp(32px,4.6vw,48px)] font-bold leading-[1.05] tracking-[-0.035em] [text-wrap:balance]">
            This is what your clients receive
          </h1>
          <p className="mx-auto mt-3.5 max-w-[600px] text-[17px] leading-[1.55] text-site-muted [text-wrap:pretty]">
            Generated from sample data under a demo brand. Yours carries <strong className="font-semibold text-site-fg">your</strong> logo,
            colours and domain — written by AI from your client&apos;s real numbers.
          </p>
        </section>

        {/* Contents rail beside the report from 1080px; below that the report
            runs full width. The sample has no PDF or share link of its own, so
            the rail offers the trial instead. */}
        <div className="mx-auto flex w-full max-w-[1200px] items-start gap-8 px-4 pb-20 sm:px-6">
          <ReportToc targetId="sample-report">
            <Link
              href="/signup"
              className="flex items-center justify-center rounded-[10px] border border-ink-300 bg-surface px-3 py-2.5 text-[13px] font-semibold text-ink-900 transition-colors hover:border-ink-900"
            >
              Start your free trial
            </Link>
          </ReportToc>
          <div id="sample-report" className="min-w-0 flex-1">
            <ReportPreview
              branding={{
                name: "Northbeam Digital",
                logo_url: null,
                // The fictional agency on this marketing page carries the
                // product's own teal, matching the site and logo around it. Real
                // reports are unaffected — they render the agency's own colour.
                brand_color: "#0F7A6C",
                website: "northbeamdigital.example",
                footer_text: "Prepared for you by Northbeam Digital — questions? hello@northbeamdigital.example",
              }}
            />
          </div>
        </div>

        <section className="mx-auto w-full max-w-[880px] px-4 pb-20 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5 rounded-[20px] bg-site-dark p-[clamp(28px,5vw,48px)] text-site-dark-fg">
            <div className="max-w-[460px]">
              <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Send one like this to your client today</h2>
              <p className="mt-2.5 text-[15px] leading-[1.55] text-site-dark-muted">
                Connect a client&apos;s Search Console, GA4 or Meta Ads and generate your first branded report in about five minutes.
              </p>
            </div>
            <Link
              href="/signup"
              className="whitespace-nowrap rounded-full bg-[rgb(var(--mark-accent-on-dark))] px-6 py-[15px] font-semibold text-report-verdict transition-colors hover:bg-site-dark-fg"
            >
              Start your free trial →
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

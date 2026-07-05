import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Brand } from "@/components/Brand";
import { ReportPreview } from "@/components/ReportPreview";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Sample client report — ReportFlow",
  description:
    "A real example of the white-label SEO & analytics report ReportFlow generates and sends for you — AI-written insights, your branding, delivered on schedule.",
};

// Public sample report — the strongest sales asset we have. Anonymous visitors
// land here from the marketing page CTA (the in-app preview is login-walled).
export default function SampleReportPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f7f9]">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link href="/" aria-label="ReportFlow home"><Brand className="text-lg" /></Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="hidden text-ink-700 hover:text-ink-900 sm:inline">Sign in</Link>
            <Link href="/signup" className="rounded-lg bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600">
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-brand-600">Sample report</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">
            This is what your clients receive
          </h1>
          <p className="mt-3 text-ink-500">
            Generated from sample data under a demo brand. Yours carries <span className="font-medium text-ink-700">your</span> logo,
            colours and domain — written by AI from your client&apos;s real numbers.
          </p>
        </div>

        <div className="mt-8">
          <ReportPreview
            branding={{
              name: "Northbeam Digital",
              logo_url: null,
              brand_color: "#4f46e5",
              website: "northbeamdigital.example",
              footer_text: "Prepared for you by Northbeam Digital — questions? hello@northbeamdigital.example",
            }}
          />
        </div>

        <div className="mt-10 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold tracking-tight text-ink-900">Send one like this to your client today</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
            Connect a client&apos;s Search Console, GA4 or Meta Ads and generate your first branded report in about five minutes.
          </p>
          <Link
            href="/signup"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-3 font-medium text-white transition hover:bg-brand-600"
          >
            Start free — no card required <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

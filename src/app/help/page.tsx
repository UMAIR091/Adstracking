import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/Brand";
import { HelpCenter } from "@/components/HelpCenter";
import { HELP_ARTICLES } from "@/lib/help/articles";

export const metadata = {
  title: "Help Center · ReportFlow",
  description: "Guides and answers for setting up clients, connecting data, and sending white-label reports with ReportFlow.",
};

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/"><Brand /></Link>
          <Link href="/dashboard" className="text-sm font-medium text-brand-600 hover:underline">Go to dashboard</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-900">Help Center</h1>
          <p className="mt-1 text-ink-500">Everything you need to set up clients, connect data and send white-label reports.</p>
        </div>
        <HelpCenter articles={HELP_ARTICLES} />
        <div className="mt-10">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
            <ArrowLeft size={15} /> Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}

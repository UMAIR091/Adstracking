import Link from "next/link";
import { format } from "date-fns";
import { Sparkles, ArrowUpRight, Wrench, ArrowLeft } from "lucide-react";
import { Brand } from "@/components/Brand";
import { CHANGELOG, type ChangeType } from "@/lib/changelog";

export const metadata = {
  title: "Changelog · ReportFlow",
  description: "New features, improvements and fixes shipping in ReportFlow.",
};

const BADGE: Record<ChangeType, { label: string; cls: string; Icon: typeof Sparkles }> = {
  new: { label: "New", cls: "bg-emerald-50 text-emerald-700", Icon: Sparkles },
  improved: { label: "Improved", cls: "bg-sky-50 text-sky-700", Icon: ArrowUpRight },
  fixed: { label: "Fixed", cls: "bg-amber-50 text-amber-700", Icon: Wrench },
};

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/"><Brand /></Link>
          <Link href="/dashboard" className="text-sm font-medium text-brand-600 hover:underline">Go to dashboard</Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">Changelog</h1>
        <p className="mt-1 text-ink-500">What&apos;s new in ReportFlow.</p>

        {CHANGELOG.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-ink-500">
            Updates will appear here soon.
          </p>
        ) : (
          <div className="mt-8 space-y-8">
            {CHANGELOG.map((entry) => (
              <div key={entry.date} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-3">
                  <time className="text-xs font-medium text-ink-400">{format(new Date(entry.date), "MMMM d, yyyy")}</time>
                  {entry.version && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-ink-500">{entry.version}</span>}
                </div>
                <h2 className="mt-1 text-lg font-semibold text-ink-900">{entry.title}</h2>
                <ul className="mt-3 space-y-2">
                  {entry.changes.map((c, i) => {
                    const b = BADGE[c.type];
                    return (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-ink-700">
                        <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${b.cls}`}>
                          <b.Icon size={11} /> {b.label}
                        </span>
                        <span className="flex-1">{c.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <Link href="/" className="mt-10 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
          <ArrowLeft size={15} /> Back to home
        </Link>
      </main>
    </div>
  );
}

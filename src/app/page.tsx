import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Brand className="text-lg" />
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-ink-700 hover:text-ink-900">Sign in</Link>
            <Link href="/signup" className="rounded-lg bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600">
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 pb-16 pt-20 text-center">
        <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          For marketing agencies
        </span>
        <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-semibold leading-tight text-ink-900 sm:text-5xl">
          Beautiful white-label client reports on autopilot
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink-500">
          The fastest way to send professional reports to clients. Flat price, unlimited clients,
          zero technical setup — no per-client fees, no bloated dashboards.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/signup" className="rounded-lg bg-brand-500 px-6 py-3 font-medium text-white hover:bg-brand-600">
            Start free
          </Link>
          <Link href="/login" className="rounded-lg border border-slate-200 px-6 py-3 font-medium text-ink-700 hover:bg-slate-50">
            Sign in
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-10">
        <div className="mx-auto max-w-5xl px-5 text-center text-sm text-ink-400">
          © {new Date().getFullYear()} ReportFlow
        </div>
      </footer>
    </div>
  );
}

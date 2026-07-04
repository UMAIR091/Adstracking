import Link from "next/link";
import { Brand } from "@/components/Brand";
import { SiteFooter } from "@/components/SiteFooter";

// Shared shell for public legal/company pages: header, title block, styled
// article body (plain semantic HTML gets typography via arbitrary variants),
// and the site footer. New legal pages only need to render content inside it.
export function LegalShell({
  title,
  subtitle,
  lastUpdated,
  children,
}: {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="ReportFlow home"><Brand /></Link>
          <nav className="flex items-center gap-5 text-sm text-ink-500">
            <Link href="/contact" className="hover:text-ink-800">Support</Link>
            <Link href="/login" className="hover:text-ink-800">Sign in</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-2 text-ink-500">{subtitle}</p>}
        {lastUpdated && <p className="mt-2 text-sm text-ink-400">Last updated: {lastUpdated}</p>}

        <article
          className={[
            "mt-8",
            "[&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink-900",
            "[&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink-900",
            "[&_p]:mt-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-ink-600",
            "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_ul]:text-sm [&_ul]:leading-relaxed [&_ul]:text-ink-600",
            "[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-6 [&_ol]:text-sm [&_ol]:leading-relaxed [&_ol]:text-ink-600",
            "[&_a]:font-medium [&_a]:text-brand-600 hover:[&_a]:underline",
            "[&_strong]:font-semibold [&_strong]:text-ink-800",
            "[&_table]:mt-4 [&_table]:w-full [&_table]:text-left [&_table]:text-sm",
            "[&_th]:border-b [&_th]:border-slate-200 [&_th]:pb-2 [&_th]:pr-4 [&_th]:font-medium [&_th]:text-ink-700",
            "[&_td]:border-b [&_td]:border-slate-100 [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top [&_td]:text-ink-600",
          ].join(" ")}
        >
          {children}
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}

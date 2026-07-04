import Link from "next/link";
import { Brand } from "@/components/Brand";
import { COMPANY, DATA_PROMISE, FOOTER_LINKS } from "@/lib/company";

// Shared site footer: brand + data promise + Product/Company/Legal columns.
// Used on the marketing page and every legal page (via LegalShell).
export function SiteFooter() {
  return (
    <footer className="border-t border-slate-100 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Brand />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-500">{COMPANY.tagline}</p>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-ink-400">{DATA_PROMISE}</p>
          </div>
          {FOOTER_LINKS.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <p className="text-sm font-semibold text-ink-900">{col.heading}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-ink-500 transition-colors hover:text-ink-800">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-slate-100 pt-6 sm:flex-row sm:items-center">
          <p className="text-sm text-ink-400">© {new Date().getFullYear()} {COMPANY.product}. All rights reserved.</p>
          <p className="text-xs text-ink-400">{COMPANY.legalName}</p>
        </div>
      </div>
    </footer>
  );
}

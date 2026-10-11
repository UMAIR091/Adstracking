import Link from "next/link";
import { Brand } from "@/components/Brand";
import { COMPANY, DATA_PROMISE, FOOTER_LINKS } from "@/lib/company";
import { siteFonts } from "@/lib/siteFonts";

// Shared site footer: brand + data promise + Product/Company/Legal columns, on
// the dark ink band. Used on the marketing pages and every legal page (via
// LegalShell). Copy comes from lib/company, never from here. Carries the site
// typefaces itself, so it looks the same on pages that do not load them.
export function SiteFooter() {
  return (
    <footer className={`${siteFonts} bg-site-dark font-site text-site-dark-muted`}>
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-6 pb-10 pt-16 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <div className="flex flex-col gap-3.5">
          <Brand reversed className="text-base" />
          <p className="text-sm leading-normal text-site-dark-fg">{COMPANY.tagline}</p>
          <p className="text-[13px] leading-[1.55]">{DATA_PROMISE}</p>
        </div>
        {FOOTER_LINKS.map((col) => (
          <nav key={col.heading} aria-label={col.heading} className="flex flex-col gap-2.5 text-sm">
            <p className="font-site-mono text-xs text-site-dark-muted/80">{col.heading}</p>
            <ul className="flex flex-col gap-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-site-dark-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto w-full max-w-[1200px] px-6">
        <p className="border-t border-site-dark-line pb-8 pt-5 text-[13px]">
          © {new Date().getFullYear()} {COMPANY.product}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

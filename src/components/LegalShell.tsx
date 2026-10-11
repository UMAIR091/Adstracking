import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { sitePage } from "@/components/site/ui";

// Shared shell for public legal pages: the site header, title block, styled
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
    <div className={`${sitePage} flex flex-col`}>
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14 sm:py-20">
        <h1 className="text-[clamp(34px,5vw,48px)] font-extrabold leading-[1.05] tracking-[-0.04em] [text-wrap:balance]">{title}</h1>
        {subtitle && <p className="mt-3 text-lg text-site-muted">{subtitle}</p>}
        {lastUpdated && <p className="mt-3 font-site-mono text-[13px] text-site-muted">Last updated: {lastUpdated}</p>}

        <article
          className={[
            "mt-10",
            "[&_h2]:mt-12 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-[-0.03em]",
            "[&_h3]:mt-7 [&_h3]:text-lg [&_h3]:font-bold",
            "[&_p]:mt-3 [&_p]:text-[15px] [&_p]:leading-[1.7] [&_p]:text-site-muted",
            "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_ul]:text-[15px] [&_ul]:leading-[1.7] [&_ul]:text-site-muted",
            "[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-6 [&_ol]:text-[15px] [&_ol]:leading-[1.7] [&_ol]:text-site-muted",
            "[&_a]:font-semibold [&_a]:text-site-fg [&_a]:underline hover:[&_a]:text-site-accent",
            "[&_strong]:font-semibold [&_strong]:text-site-fg",
            "[&_table]:mt-4 [&_table]:w-full [&_table]:text-left [&_table]:text-sm",
            "[&_th]:border-b [&_th]:border-site-line-strong [&_th]:pb-2 [&_th]:pr-4 [&_th]:font-semibold",
            "[&_td]:border-b [&_td]:border-site-line [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top [&_td]:text-site-muted",
          ].join(" ")}
        >
          {children}
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}

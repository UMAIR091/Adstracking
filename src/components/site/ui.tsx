import Link from "next/link";
import { Check } from "lucide-react";
import { siteFonts } from "@/lib/siteFonts";

// Shared building blocks for the public marketing pages: one container width,
// one button pair, one eyebrow and heading scale, so every page reads as the
// same site. Colours are the --site-* tokens in globals.css.

/** Root of a marketing page: site typefaces, paper background, teal focus. */
export const sitePage = `${siteFonts} site-root min-h-screen bg-site-page font-site text-site-fg`;

/** 1200px content width with 24px gutters. */
export const container = "mx-auto w-full max-w-[1200px] px-6";

const pill =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-[26px] py-4 text-base font-semibold transition-colors";

/** Solid ink pill; turns teal on hover. */
export const btnPrimary = `${pill} bg-site-cta text-site-cta-fg hover:bg-site-cta-hover hover:text-site-cta-hover-fg`;

/** 1px outline pill; the border darkens to ink on hover. */
export const btnOutline = `${pill} border border-site-line-strong text-site-fg hover:border-site-fg`;

/** Underlined text link with an arrow, for "See full pricing →" and friends. */
export const textLink =
  "inline-flex items-center gap-1 whitespace-nowrap border-b-2 border-site-fg pb-0.5 font-semibold transition-colors hover:border-site-accent hover:text-site-accent";

/** Small mono label above a section heading. */
export function Eyebrow({ children, onDark = false, className = "" }: { children: React.ReactNode; onDark?: boolean; className?: string }) {
  return (
    <p className={`mb-4 font-site-mono text-[13px] ${onDark ? "text-site-dark-accent" : "text-site-accent"} ${className}`}>
      {children}
    </p>
  );
}

/** Section heading: heavy, tight, fluid. `size="sm"` for the split sections. */
export function H2({ children, id, size = "lg", className = "" }: { children: React.ReactNode; id?: string; size?: "lg" | "sm"; className?: string }) {
  const scale = size === "lg" ? "text-[clamp(32px,4.5vw,52px)]" : "text-[clamp(30px,4vw,46px)]";
  return (
    <h2 id={id} className={`${scale} font-bold leading-[1.05] tracking-[-0.035em] [text-wrap:balance] ${className}`}>
      {children}
    </h2>
  );
}

/** A tick in a soft teal disc, then the line of copy. */
export function CheckList({ items, large = false }: { items: React.ReactNode[]; large?: boolean }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className={`flex gap-3 ${large ? "text-[17px] leading-normal" : "text-base leading-[1.45]"}`}>
          <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-site-accent-soft text-site-accent" aria-hidden>
            <Check size={12} strokeWidth={3} />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** The closing dark panel: headline and body left, actions right. */
export function CtaPanel({
  title,
  body,
  cta,
  footnote,
}: {
  title: React.ReactNode;
  body: React.ReactNode;
  cta: { href: string; label: React.ReactNode };
  footnote: React.ReactNode;
}) {
  return (
    <section className={`${container} pb-[96px] lg:pb-[110px]`}>
      <div className="grid items-end gap-8 rounded-3xl bg-site-dark p-[clamp(40px,6vw,80px)] text-site-dark-fg [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
        <div>
          <h2 className="text-[clamp(32px,5vw,58px)] font-bold leading-none tracking-[-0.04em] [text-wrap:balance]">{title}</h2>
          <p className="mt-5 max-w-[520px] text-[17px] leading-[1.55] text-site-dark-muted">{body}</p>
        </div>
        <div className="flex flex-col items-start gap-3.5">
          <div className="flex flex-wrap gap-3">
            <Link
              href={cta.href}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-site-dark-accent px-[26px] py-4 text-base font-semibold text-site-dark transition-colors hover:bg-site-dark-fg"
            >
              {cta.label}
            </Link>
            <Link
              href="/sample-report"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-site-dark-line px-[26px] py-4 text-base font-semibold text-site-dark-fg transition-colors hover:border-site-dark-fg"
            >
              View a sample report
            </Link>
          </div>
          <p className="font-site-mono text-xs text-site-dark-muted">{footnote}</p>
        </div>
      </div>
    </section>
  );
}

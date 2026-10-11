import Link from "next/link";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";

// The marketing header, shared by every public page. Sticky and translucent
// with a hairline underneath. On narrow screens the nav drops to its own row
// and scrolls sideways, so the buttons beside the logo never wrap.
const NAV = [
  { label: "How it works", href: "/#how" },
  { label: "Features", href: "/#features" },
  { label: "Integrations", href: "/#integrations" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-site-line bg-site-page/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-7 gap-y-1 px-6 py-3.5">
        <Link href="/" aria-label="Anavyst home" className="shrink-0">
          <Brand className="text-[17px]" />
        </Link>
        <nav
          aria-label="Main"
          className="order-last -mx-6 flex w-[calc(100%+3rem)] gap-[22px] overflow-x-auto whitespace-nowrap px-6 py-1.5 text-[15px] font-medium [scrollbar-width:none] lg:order-none lg:mx-0 lg:w-auto lg:min-w-0 lg:flex-1 lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {NAV.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-site-accent">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* Public, so the theme can be set before signing in. Hidden on
              phones, where the page follows the system theme, so the logo and
              the button keep one row. */}
          <div className="hidden sm:block">
            <ThemeToggle compact />
          </div>
          <Link
            href="/login"
            className="hidden whitespace-nowrap px-3.5 py-2.5 text-[15px] font-medium transition-colors hover:text-site-accent sm:inline"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="whitespace-nowrap rounded-full bg-site-cta px-[18px] py-2.5 text-[15px] font-semibold text-site-cta-fg transition-colors hover:bg-site-cta-hover hover:text-site-cta-hover-fg"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

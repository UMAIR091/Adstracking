import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, DATA_PROMISE } from "@/lib/company";
import { PAID_TRIAL_DAYS } from "@/lib/billing/config";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { CheckList, CtaPanel, Eyebrow, sitePage } from "@/components/site/ui";

export const metadata: Metadata = {
  title: `About — ${COMPANY.product}`,
  description: `What ${COMPANY.product} is and why it exists.`,
};

// Heading on the left, body on the right, a hairline above each row.
function Row({ title, first = false, children }: { title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`grid gap-x-16 gap-y-6 border-t border-site-line-strong pt-10 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))] ${
        first ? "mt-[72px]" : "mt-14"
      }`}
    >
      <h2 className="text-[28px] font-bold tracking-[-0.03em]">{title}</h2>
      <div>{children}</div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className={`${sitePage} flex flex-col`}>
      <SiteHeader />

      <main className="w-full flex-1">
        <section className="mx-auto w-full max-w-[1100px] px-6 pb-[96px] pt-16 sm:pt-20 lg:pb-[110px]">
          <Eyebrow className="!mb-[18px]">About {COMPANY.product}</Eyebrow>
          <h1 className="max-w-[900px] text-[clamp(40px,6vw,72px)] font-extrabold leading-none tracking-[-0.045em] [text-wrap:balance]">
            Client reporting that used to take hours, done in minutes.
          </h1>

          <Row title="Why we built this" first>
            <div className="flex flex-col gap-[18px] text-lg leading-[1.65] text-site-muted">
              <p>
                Every agency knows the monthly ritual: export screenshots, paste charts into a deck, write the same
                summary paragraphs, send, repeat — for every client. Reporting tools that fix this either charge per
                client (so growing hurts) or take weeks to set up.
              </p>
              <p>
                {COMPANY.product} takes the opposite approach:{" "}
                <strong className="font-semibold text-site-fg">every feature on every plan, simple pricing, zero setup</strong>.
                Connect a client&apos;s data sources once, and beautiful white-label reports — with AI-written executive
                summaries — go out on schedule under your brand: your logo and colours on every report and PDF, sent from
                your own verified domain.
              </p>
            </div>
          </Row>

          <Row title="What it does">
            <CheckList
              large
              items={[
                "Pulls SEO, analytics, and ad-platform metrics from the sources you connect (read-only).",
                "Writes the executive summary, wins, issues, and recommendations with AI — grounded in your real numbers.",
                "Delivers branded reports as live links and PDF attachments, weekly, monthly, or quarterly.",
              ]}
            />
          </Row>

          <Row title="What we believe">
            <ul className="flex flex-col gap-6">
              {[
                { t: "Your data is yours.", d: DATA_PROMISE },
                { t: "Fewer features, done well.", d: "We deliberately build the 5% of features agencies use every week — and polish them." },
                { t: "Your brand, not ours.", d: "White-label means invisible. We stay out of your client relationships." },
              ].map((b) => (
                <li key={b.t}>
                  <h3 className="mb-1.5 text-[19px] font-bold">{b.t}</h3>
                  <p className="text-base leading-[1.55] text-site-muted">{b.d}</p>
                </li>
              ))}
            </ul>
          </Row>

          <div className="mt-[72px] rounded-[20px] bg-site-dark p-10 text-site-dark-fg">
            <h2 className="mb-3 text-[28px] font-bold tracking-[-0.03em]">The company</h2>
            <p className="max-w-[640px] text-[17px] leading-[1.6] text-site-dark-muted">
              {COMPANY.product} is an independently built and operated product. Questions or ideas? We&apos;d love to hear
              from you —{" "}
              <Link href="/contact" className="text-site-dark-accent underline hover:text-site-dark-fg">
                get in touch
              </Link>
              .
            </p>
          </div>
        </section>

        <CtaPanel
          title="Your next client report could send itself"
          body={
            <>
              Free for {PAID_TRIAL_DAYS} days. Connect a client, and have a fully branded, AI-written report in your hands
              before your coffee goes cold.
            </>
          }
          cta={{ href: "/signup", label: "Start free" }}
          footnote={<>Every feature on every plan · {PAID_TRIAL_DAYS}-day free trial · Cancel anytime</>}
        />
      </main>

      <SiteFooter />
    </div>
  );
}

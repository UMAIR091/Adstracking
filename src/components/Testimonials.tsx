// Testimonials + customer-logo section (launch audit P2-11). Data-driven and
// self-hiding: renders NOTHING until you add entries, so it's safe to mount on
// the landing page now and it appears automatically once you have social proof.
import { Star } from "lucide-react";

export type Testimonial = { quote: string; name: string; role: string; avatarUrl?: string };
export type CustomerLogo = { name: string; logoUrl: string };

// Fill these in as customers come on board.
export const TESTIMONIALS: Testimonial[] = [];
export const CUSTOMER_LOGOS: CustomerLogo[] = [];

export function Testimonials() {
  if (TESTIMONIALS.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-5 py-16">
      <h2 className="text-center text-2xl font-semibold tracking-tight text-ink-900">Loved by lean agencies</h2>
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((t, i) => (
          <figure key={i} className="rounded-2xl border border-ink-200 bg-surface p-6">
            <div className="flex gap-0.5 text-warning-400" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((s) => <Star key={s} size={14} fill="currentColor" />)}
            </div>
            <blockquote className="mt-3 text-sm leading-relaxed text-ink-700">&ldquo;{t.quote}&rdquo;</blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              {t.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.avatarUrl} alt="" width={36} height={36} loading="lazy" decoding="async" className="h-9 w-9 rounded-full object-cover" />
              )}
              <div>
                <p className="text-sm font-medium text-ink-900">{t.name}</p>
                <p className="text-xs text-ink-500">{t.role}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function CustomerLogos() {
  if (CUSTOMER_LOGOS.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-5 py-10">
      <p className="text-center text-xs font-medium uppercase tracking-wide text-ink-400">Trusted by agencies</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 opacity-70">
        {CUSTOMER_LOGOS.map((c) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={c.name} src={c.logoUrl} alt={c.name} height={28} loading="lazy" decoding="async" className="h-7 w-auto object-contain" />
        ))}
      </div>
    </section>
  );
}

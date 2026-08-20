import type { ReactNode } from "react";

// Consistent section framing inside the client workspace: a titled band with an
// optional one-line description and a trailing control.
//
// Lifted out of the old single client page unchanged, so the five tabs frame
// their content identically rather than each inventing a heading style.
export function ClientSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  /** Optional control rendered on the header's trailing edge. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-6 first:mt-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 pb-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink-900">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

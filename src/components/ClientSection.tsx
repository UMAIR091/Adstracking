import type { ReactNode } from "react";

// Consistent section framing inside the client workspace: a title with an
// optional one-line description and a trailing control, above the section's
// cards. Lifted out of the old single client page, so the five tabs frame
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
    <section id={id} className="mt-8 scroll-mt-6 first:mt-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
          {description ? <p className="mt-0.5 text-[12.5px] text-ink-400">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

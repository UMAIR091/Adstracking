import Link from "next/link";
import { format } from "date-fns";

// "Up next": the scheduled deliveries closest to going out, each with a date
// tile, so the automation is visible as work happening on the user's behalf.
// The rows come from the enabled schedules the page already queried.

export type UpNextItem = {
  id: string;
  clientId: string | null;
  clientName: string;
  frequency: string;
  nextRunAt: string;
};

export function UpNext({ items }: { items: UpNextItem[] }) {
  return (
    <section aria-labelledby="upnext-heading" className="rounded-card border border-ink-200 bg-surface px-[18px] py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="upnext-heading" className="text-[15px] font-semibold text-ink-900">Up next</h2>
        <span className="text-xs text-ink-400">Scheduled deliveries</span>
      </div>
      {items.length === 0 ? (
        <div className="mt-3">
          <p className="text-[13.5px] leading-relaxed text-ink-500">
            Nothing scheduled yet. Put a client on a weekly or monthly schedule and Anavyst generates the report,
            attaches the PDF and emails it.
          </p>
          <Link href="/dashboard/clients" className="mt-2 inline-block text-[13.5px] font-medium text-brand-600 hover:text-ink-900">
            Set up a schedule →
          </Link>
        </div>
      ) : (
        <ul className="mt-2.5">
          {items.slice(0, 3).map((s, i) => {
            const when = new Date(s.nextRunAt);
            const row = (
              <>
                <span className="w-[42px] shrink-0 rounded-[9px] bg-canvas py-[5px] text-center">
                  <span className="block font-app-mono text-[10px] uppercase text-ink-400">{format(when, "MMM")}</span>
                  <span className="block text-[17px] font-semibold leading-tight text-ink-900">{format(when, "d")}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink-900">{s.clientName}</span>
                  <span className="mt-0.5 block text-[12.5px] text-ink-400">
                    <span className="capitalize">{s.frequency}</span> · {format(when, "HH:mm")} UTC
                  </span>
                </span>
              </>
            );
            return (
              <li key={s.id} className={i ? "border-t border-ink-100" : ""}>
                {s.clientId ? (
                  <Link href={`/dashboard/clients/${s.clientId}/automations`} className="-mx-2 flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-ink-50">
                    {row}
                  </Link>
                ) : (
                  <div className="flex gap-3 py-2.5">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

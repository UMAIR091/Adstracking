"use client";

import Link from "next/link";
import { useRef } from "react";
import { cn } from "@/lib/utils";

// Segmented control: a grey track with the selected option lifted on white.
// Used for filters (All / Needs attention / Healthy) and short choices such as
// a report period. A radiogroup, so arrow keys move the selection and only the
// checked option is in the tab order.

const TRACK = "inline-flex max-w-full gap-1 overflow-x-auto rounded-control bg-segment p-[3px] [scrollbar-width:none]";
const ITEM = "whitespace-nowrap rounded-[8px] px-3 py-[7px] text-[13px] font-medium transition-colors focus-ring";
const ON = "bg-surface text-ink-900 shadow-[0_1px_2px_rgb(18_23_28_/_0.1)]";
const OFF = "text-ink-500 hover:text-ink-900";

export type SegmentedOption<T extends string> = { value: T; label: string; count?: number };

function Count({ n }: { n?: number }) {
  if (n === undefined) return null;
  return <span className="ml-1.5 font-app-mono text-[11.5px] text-ink-400">{n}</span>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Filter clients". */
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (i: number) => {
    const n = (i + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn(TRACK, className)}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); select(i + 1); }
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); select(i - 1); }
              else if (e.key === "Home") { e.preventDefault(); select(0); }
              else if (e.key === "End") { e.preventDefault(); select(options.length - 1); }
            }}
            className={cn(ITEM, active ? ON : OFF)}
          >
            {o.label}
            <Count n={o.count} />
          </button>
        );
      })}
    </div>
  );
}

/** The same control for filters that live in the URL (server-rendered lists). */
export function SegmentedLinks({
  items,
  label,
  className,
}: {
  items: { href: string; label: string; active: boolean; count?: number }[];
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn(TRACK, className)}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          scroll={false}
          aria-current={it.active ? "page" : undefined}
          className={cn(ITEM, it.active ? ON : OFF)}
        >
          {it.label}
          <Count n={it.count} />
        </Link>
      ))}
    </nav>
  );
}

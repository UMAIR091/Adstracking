"use client";

// Lightweight, accessible contextual help (journey audit P1-5 / P2-10). A small
// info affordance that reveals an explainer on hover AND keyboard focus — used to
// teach powerful-but-hidden features (AI insights, white-label, scheduling,
// sharing) in place, without intrusive popups.
import { HelpCircle } from "lucide-react";

export function HelpHint({ children, label = "More information", side = "top" }: { children: React.ReactNode; label?: string; side?: "top" | "bottom" }) {
  const pos = side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5";
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="inline-flex rounded-full text-ink-400 transition-colors hover:text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <HelpCircle size={14} />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-40 w-56 -translate-x-1/2 rounded-lg bg-ink-900 px-3 py-2 text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${pos}`}
      >
        {children}
      </span>
    </span>
  );
}

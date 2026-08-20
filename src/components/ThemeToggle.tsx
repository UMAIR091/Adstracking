"use client";

// Light / Dark / System, as a segmented control.
//
// Three segments rather than a two-state switch, because "follow my OS" is a
// real answer and it is the app's default — a two-state toggle would force
// every user to pin a theme the first time they touched it.
//
// The same selected treatment as the sidebar's active nav row and the
// Performance period control: the chosen segment is a surface card lifted off
// the recessed track, so which one is current reads structurally rather than as
// a colour wash.
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { applyThemeChoice, readThemeChoice, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({
  className = "",
  compact = false,
}: {
  className?: string;
  /** Icons only — for the marketing header, where there is no room for labels. */
  compact?: boolean;
}) {
  // Server and first client render must agree, so the real choice is read after
  // mount. public/theme.js has already painted the right palette by then — this
  // state only drives which segment looks selected.
  const [choice, setChoice] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    // Re-apply, not just read. The boot script is the fast path; this is the
    // guarantee — if it was blocked, missing or slow, the stored choice still
    // takes effect as soon as the app is interactive rather than silently
    // reverting the user to their OS theme.
    const stored = readThemeChoice();
    applyThemeChoice(stored);
    setChoice(stored);
  }, []);

  function select(next: ThemeChoice) {
    applyThemeChoice(next);
    setChoice(next);
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={`flex items-center gap-0.5 rounded-lg border border-ink-200 bg-surface-subtle p-0.5 ${className}`}
    >
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = choice === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => select(o.value)}
            aria-pressed={active}
            aria-label={`${o.label} theme`}
            title={`${o.label} theme`}
            className={`focus-ring flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${
              compact ? "px-2 py-1.5" : "flex-1 px-2 py-1.5"
            } ${active ? "bg-surface text-ink-900 shadow-xs" : "text-ink-500 hover:text-ink-800"}`}
          >
            <Icon size={14} aria-hidden />
            {!compact && o.label}
          </button>
        );
      })}
    </div>
  );
}

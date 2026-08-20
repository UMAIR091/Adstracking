// How an integration looks: its icon component and its tint.
//
// This table was duplicated in IntegrationCard and ConnectAccountModal, and the
// two had already drifted — the card's map was missing YouTube and the `red`
// and `ink` tints, so a source rendered with a generic plug in one place and its
// real mark in the other. One table, read by every surface that draws an
// integration.
//
// Values come from the registry descriptors (`icon`, `accent`), so adding an
// integration needs no change here unless it introduces a new mark.
import {
  Search, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Ghost, Twitter, Youtube,
  Plug, ShoppingBag, FileSpreadsheet, Magnet, Database,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Search, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Ghost, Twitter, Youtube,
  ShoppingBag, FileSpreadsheet, Magnet, Database,
};

// Full literal class strings so Tailwind's scanner keeps them.
const TINTS: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  rose: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
  cyan: "bg-cyan-50 text-cyan-600",
  fuchsia: "bg-fuchsia-50 text-fuchsia-600",
  red: "bg-red-50 text-red-600",
  ink: "bg-ink-100 text-ink-700",
};

/** The descriptor's mark, or a generic plug for one we don't have art for. */
export function integrationIcon(icon: string | null | undefined): LucideIcon {
  return (icon && ICONS[icon]) || Plug;
}

/** The descriptor's tint classes, or the neutral fallback. */
export function integrationTint(accent: string | null | undefined): string {
  return (accent && TINTS[accent]) || "bg-ink-100 text-ink-600";
}

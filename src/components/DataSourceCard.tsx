import Link from "next/link";
import { Search, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Twitter, Youtube, Ghost, Plug, ShoppingBag, FileSpreadsheet, Magnet } from "lucide-react";

// Reusable data-source card. Adding a new platform = add a descriptor in
// lib/integrations/providers.ts (and, if its icon/accent is new, one line here).
// No other UI change is required — the Data Sources grid is registry-driven.
const ICONS: Record<string, typeof Search> = {
  Search, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Twitter, Youtube, Ghost, ShoppingBag, FileSpreadsheet, Magnet,
};
const TINTS: Record<string, string> = {
  emerald: "bg-success-50 text-success-600",
  amber: "bg-warning-50 text-warning-600",
  sky: "bg-info-50 text-info-600",
  rose: "bg-danger-50 text-danger-600",
  blue: "bg-info-50 text-info-600",
  cyan: "bg-info-50 text-info-600",
  fuchsia: "bg-brand-50 text-brand-600",
  red: "bg-danger-50 text-danger-600",
  ink: "bg-ink-100 text-ink-700",
};

export type DataSourceCardData = {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name (serializable)
  accent: string; // tint key
  status: "live" | "soon";
  connectedCount: number; // clients this source is connected for
  connectHref: string; // where the Connect button points
};

export function DataSourceCard({ data }: { data: DataSourceCardData }) {
  const { name, description, icon, accent, status, connectedCount, connectHref } = data;
  const Icon = ICONS[icon] ?? Plug;
  const tint = TINTS[accent] ?? "bg-ink-100 text-ink-600";
  const isConnected = status === "live" && connectedCount > 0;
  const isAvailable = status === "live" && connectedCount === 0;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-ink-200 bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] ${tint}`}>
          <Icon size={17} aria-hidden />
        </span>
        <span className="flex-1 text-sm font-semibold text-ink-900">{name}</span>
        {isConnected && (
          <span className="whitespace-nowrap rounded-full bg-success-50 px-[7px] py-0.5 text-[11.5px] text-success-700">
            {connectedCount} client{connectedCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <p className="flex-1 text-[12.5px] leading-snug text-ink-500">{description}</p>
      {status === "live" ? (
        <Link href={connectHref} className="text-[13px] font-medium text-brand-600 hover:text-ink-900">
          {isAvailable ? "Connect to a client →" : "Connect another client →"}
        </Link>
      ) : (
        <span className="text-[13px] text-ink-400">Coming soon</span>
      )}
    </div>
  );
}

import Link from "next/link";
import { Search, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Twitter, Youtube, Ghost, Plug, ShoppingBag, FileSpreadsheet, Magnet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Reusable data-source card. Adding a new platform = add a descriptor in
// lib/integrations/providers.ts (and, if its icon/accent is new, one line here).
// No other UI change is required — the Data Sources grid is registry-driven.
const ICONS: Record<string, typeof Search> = {
  Search, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Twitter, Youtube, Ghost, ShoppingBag, FileSpreadsheet, Magnet,
};
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
    <Card className="flex flex-col transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
            <Icon size={20} />
          </div>
          {isConnected ? (
            <Badge variant="success" dot>Connected</Badge>
          ) : isAvailable ? (
            <Badge variant="info" dot>Available</Badge>
          ) : (
            <Badge variant="muted">Coming soon</Badge>
          )}
        </div>

        <p className="mt-4 font-semibold text-ink-900">{name}</p>
        <p className="mt-0.5 text-sm text-ink-500">{description}</p>

        <div className="mt-4 flex items-center justify-between pt-1">
          <p className="text-xs text-ink-400">
            {isConnected
              ? `Connected for ${connectedCount} client${connectedCount === 1 ? "" : "s"}`
              : isAvailable
                ? "Ready to connect"
                : "Available in an upcoming release"}
          </p>
          {isConnected ? (
            <Button asChild variant="outline" size="sm">
              <Link href={connectHref}>Manage</Link>
            </Button>
          ) : isAvailable ? (
            <Button asChild size="sm">
              <Link href={connectHref}>Connect</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Coming soon
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

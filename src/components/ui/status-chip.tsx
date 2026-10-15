import { cn } from "@/lib/utils";
import { SOURCE_HEALTH, type SourceHealth } from "@/lib/integrations/status";

// The one status display in the app: a pill with a 6px dot and a short label,
// never wrapping. Every health or state readout uses it, so "healthy" and
// "reconnect" look the same on Home, Clients, Integrations and the client page.
//   success  healthy / delivered        danger   reconnect, sync error, failed
//   warning  a choice to make           info     first sync, in progress
//   muted    nothing connected / idle
export type StatusTone = "success" | "danger" | "warning" | "info" | "muted";

const FILL: Record<StatusTone, string> = {
  success: "bg-success-50 text-success-700",
  danger: "bg-danger-50 text-danger-700",
  warning: "bg-warning-50 text-warning-700",
  info: "bg-info-50 text-info-700",
  muted: "bg-ink-100 text-ink-500",
};

const DOT: Record<StatusTone, string> = {
  success: "bg-success-500",
  danger: "bg-danger-500",
  warning: "bg-warning-500",
  info: "bg-info-500",
  muted: "bg-ink-subtle",
};

export function StatusDot({ tone, className }: { tone: StatusTone; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone], className)} />;
}

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-medium",
        FILL[tone],
        className
      )}
    >
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}

/** A data source's health, labelled from the shared SOURCE_HEALTH map. */
export function HealthChip({ health, long = false, className }: { health: SourceHealth; long?: boolean; className?: string }) {
  const p = SOURCE_HEALTH[health];
  return (
    <StatusChip tone={p.variant} className={className}>
      {long ? p.label : p.short}
    </StatusChip>
  );
}

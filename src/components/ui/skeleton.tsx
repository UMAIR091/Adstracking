import { cn } from "@/lib/utils";

// Shimmering placeholder for loading states.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-ink-200/70", className)} {...props}>
      {/* The sweep is a lightened tint of the surface rather than literal
          white, so it reads as a soft highlight in light mode and doesn't
          glow against charcoal in dark mode. */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-surface/60 to-transparent" />
    </div>
  );
}

export { Skeleton };

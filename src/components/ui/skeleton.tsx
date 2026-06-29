import { cn } from "@/lib/utils";

// Shimmering placeholder for loading states.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-ink-200/60", className)} {...props}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}

export { Skeleton };

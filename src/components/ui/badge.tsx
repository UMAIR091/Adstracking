import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  default: "bg-brand-50 text-brand-700",
  success: "bg-green-50 text-green-700",
  muted: "bg-slate-100 text-ink-600",
  warning: "bg-amber-50 text-amber-700",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", styles[variant], className)}
      {...props}
    />
  );
}

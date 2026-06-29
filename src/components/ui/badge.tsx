import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  default: "bg-brand-50 text-brand-700 ring-brand-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  muted: "bg-ink-100 text-ink-600 ring-ink-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  info: "bg-sky-50 text-sky-700 ring-sky-100",
  danger: "bg-red-50 text-red-700 ring-red-100",
};

const dotColor: Record<string, string> = {
  default: "bg-brand-500",
  success: "bg-emerald-500",
  muted: "bg-ink-400",
  warning: "bg-amber-500",
  info: "bg-sky-500",
  danger: "bg-red-500",
};

export function Badge({
  className,
  variant = "default",
  dot = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles; dot?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", styles[variant], className)}
      {...props}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColor[variant])} />}
      {children}
    </span>
  );
}

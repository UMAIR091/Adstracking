import { cn } from "@/lib/utils";

// Semantic status tokens rather than literal hues, so a badge stays legible in
// both themes: `-50` is the soft fill, `-700` the text, `-500` the dot.
const styles: Record<string, string> = {
  default: "bg-brand-50 text-brand-700 ring-brand-200/60",
  success: "bg-success-50 text-success-700 ring-success-100",
  muted: "bg-ink-100 text-ink-600 ring-ink-200",
  warning: "bg-warning-50 text-warning-700 ring-warning-100",
  info: "bg-info-50 text-info-700 ring-info-100",
  danger: "bg-danger-50 text-danger-700 ring-danger-100",
};

const dotColor: Record<string, string> = {
  default: "bg-brand-500",
  success: "bg-success-500",
  muted: "bg-ink-400",
  warning: "bg-warning-500",
  info: "bg-info-500",
  danger: "bg-danger-500",
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

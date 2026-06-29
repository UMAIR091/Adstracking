import { type LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-300 bg-surface-subtle px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 ring-1 ring-inset ring-brand-100">
        <Icon size={26} />
      </div>
      <p className="mt-4 text-base font-semibold text-ink-900">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

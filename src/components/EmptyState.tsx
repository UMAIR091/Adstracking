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
    <div className="animate-fade-in flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-300 bg-surface px-6 py-14 text-center">
      {/* Flat tinted tile rather than a gradient chip — the gradient was the
          single most "generic SaaS" detail in the component set. */}
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon size={22} />
      </div>
      <p className="mt-3.5 text-lg font-semibold text-ink-900">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[420px] text-sm leading-relaxed text-ink-500">{description}</p>
      {action && <div className="mt-[18px]">{action}</div>}
    </div>
  );
}

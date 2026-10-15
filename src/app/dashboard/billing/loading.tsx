import { Skeleton } from "@/components/ui/skeleton";
import { SettingsSkeleton } from "@/components/ui/page-skeletons";

// Mirrors the page: the ink plan card, then the plans.
export default function BillingLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-3 rounded-card bg-nav-bg p-[22px]">
        <Skeleton className="h-3 w-24 bg-nav-line" />
        <Skeleton className="h-7 w-48 bg-nav-line" />
        <Skeleton className="h-4 w-80 max-w-full bg-nav-line" />
      </div>
      <SettingsSkeleton cards={1} />
    </div>
  );
}

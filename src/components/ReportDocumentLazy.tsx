"use client";

// Lazy ReportDocument for the AUTHENTICATED report view (perf audit — complete
// chart lazy-loading). recharts + the full report renderer load on hydration
// instead of in the route's initial JS. The public share page (/r/[token])
// intentionally keeps the non-lazy ReportDocument so shared links render
// server-side for the best first-paint.
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export const ReportDocument = dynamic(
  () => import("@/components/ReportDocument").then((m) => m.ReportDocument),
  { ssr: false, loading: ReportSkeleton }
);

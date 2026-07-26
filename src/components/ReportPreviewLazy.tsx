"use client";

// Lazy ReportPreview (perf audit — complete chart lazy-loading): keeps recharts
// out of the /dashboard/reports/preview initial bundle; loads on hydration.
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

export const ReportPreview = dynamic(
  () => import("@/components/ReportPreview").then((m) => m.ReportPreview),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full rounded-xl" /> }
);

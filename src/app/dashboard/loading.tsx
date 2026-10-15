import { HomeSkeleton } from "@/components/ui/page-skeletons";

// Mirrors the page block for block, so nothing reflows when data arrives.
export default function DashboardLoading() {
  return <HomeSkeleton />;
}

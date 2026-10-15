import { ListPageSkeleton } from "@/components/ui/page-skeletons";

// Mirrors the page block for block, so nothing reflows when data arrives.
export default function ReportsLoading() {
  return <ListPageSkeleton actions={2} filters={3} rows={7} />;
}

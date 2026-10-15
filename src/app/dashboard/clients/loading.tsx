import { ListPageSkeleton } from "@/components/ui/page-skeletons";

// Mirrors the page block for block, so nothing reflows when data arrives.
export default function ClientsLoading() {
  return <ListPageSkeleton actions={1} filters={2} />;
}

import { WorkspaceSkeleton } from "@/components/ui/page-skeletons";

// Mirrors the page block for block, so nothing reflows when data arrives.
export default function ClientLoading() {
  return <WorkspaceSkeleton />;
}

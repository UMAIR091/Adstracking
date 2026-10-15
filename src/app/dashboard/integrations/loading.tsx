import { IntegrationsSkeleton } from "@/components/ui/page-skeletons";

// Mirrors the page block for block, so nothing reflows when data arrives.
export default function IntegrationsLoading() {
  return <IntegrationsSkeleton />;
}

import { SettingsSkeleton } from "@/components/ui/page-skeletons";

// Mirrors the page block for block, so nothing reflows when data arrives.
export default function SettingsLoading() {
  return <SettingsSkeleton cards={3} />;
}

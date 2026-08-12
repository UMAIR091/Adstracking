import { SettingsNav } from "@/components/SettingsNav";

// Wraps every /dashboard/settings route with the grouped nav. Purely a shell —
// each page keeps its own heading, data loading and behaviour unchanged.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <SettingsNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

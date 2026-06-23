import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <Sidebar agencyName={agency?.name ?? "My Agency"} userEmail={user.email ?? ""} />
      <div className="lg:pl-60">
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10">{children}</main>
      </div>
      <CommandPalette />
      <Toaster richColors position="top-right" />
    </div>
  );
}

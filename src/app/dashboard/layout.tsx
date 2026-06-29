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
        <main className="animate-fade-in mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">{children}</main>
      </div>
      <CommandPalette />
      <Toaster richColors position="top-right" toastOptions={{ style: { borderRadius: "12px" } }} />
    </div>
  );
}

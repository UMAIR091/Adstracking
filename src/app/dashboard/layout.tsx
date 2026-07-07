import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionState } from "@/lib/billing/subscription";
import { Sidebar } from "@/components/Sidebar";
import { BillingBanner } from "@/components/BillingBanner";
import { CommandPalette } from "@/components/CommandPalette";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  const billing = agency ? await getSubscriptionState(createClient(), agency.id) : null;

  return (
    <div className="min-h-screen">
      <Sidebar agencyName={agency?.name ?? "My Agency"} userEmail={user.email ?? ""} />
      <div className="lg:pl-60">
        <main className="animate-fade-in mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
          {billing && (
            <BillingBanner
              hasAccess={billing.hasAccess}
              blockedReason={billing.blockedReason}
              trialDaysLeft={billing.trialDaysLeft}
              isTrial={billing.plan === "trial"}
            />
          )}
          {children}
        </main>
      </div>
      <CommandPalette />
      <Toaster richColors position="top-right" toastOptions={{ style: { borderRadius: "12px" } }} />
    </div>
  );
}

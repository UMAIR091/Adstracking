import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionState } from "@/lib/billing/subscription";
import { Sidebar } from "@/components/Sidebar";
import { BillingBanner } from "@/components/BillingBanner";
import { CommandPalette } from "@/components/CommandPalette";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { AnalyticsIdentify } from "@/components/AnalyticsIdentify";
import { IncidentBanner } from "@/components/IncidentBanner";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  // First-run guard: send brand-new agencies through onboarding first, so their
  // first report is already white-labeled (journey audit P0-2).
  if (agency && !agency.onboarding_completed_at) redirect("/onboarding");

  const billing = agency ? await getSubscriptionState(createClient(), agency.id) : null;

  // The dashboard CSP carries 'strict-dynamic', which makes the browser
  // ignore the 'self' that lets /theme.js run on the marketing pages — so the
  // same snippet is inlined here with the request nonce. This layout is already
  // dynamic (it awaits the session), so reading the header costs nothing.
  const nonce = headers().get("x-nonce") ?? undefined;

  return (
    <ConfirmProvider>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      <AnalyticsIdentify userId={user.id} email={user.email ?? null} agencyName={agency?.name ?? null} />
      <IncidentBanner />
      <FeedbackWidget />
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
    </ConfirmProvider>
  );
}

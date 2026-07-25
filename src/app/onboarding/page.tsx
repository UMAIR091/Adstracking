import { redirect } from "next/navigation";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { Brand } from "@/components/Brand";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome to ReportFlow" };

// First-run onboarding. Auto-creates the agency (via getCurrentUserAndAgency)
// then guides branding + defaults before the user reaches the dashboard.
export default async function OnboardingPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");
  // Already onboarded → straight to the app.
  if (agency.onboarding_completed_at) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-10">
      <div className="mb-8 flex justify-center">
        <Brand className="text-lg" />
      </div>
      <OnboardingWizard
        agency={{
          id: agency.id,
          name: agency.name,
          logo_url: agency.logo_url,
          brand_color: agency.brand_color,
          email_sender_name: agency.email_sender_name,
          email_reply_to: agency.email_reply_to,
          timezone: agency.timezone,
          report_language: agency.report_language,
        }}
      />
    </main>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { Brand } from "@/components/Brand";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { AppBodyFont } from "@/components/AppBodyFont";
import { reportFonts } from "@/lib/reportFonts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome to Anavyst" };

// First-run onboarding. Auto-creates the agency (via getCurrentUserAndAgency)
// then guides branding + defaults before the user reaches the dashboard.
export default async function OnboardingPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");
  // Already onboarded → straight to the app.
  if (agency.onboarding_completed_at) redirect("/dashboard");

  return (
    // `.app-root`: the signed-in palette and Geist, same as the dashboard.
    <main className={`app-root ${reportFonts} min-h-screen bg-canvas px-4 py-10 text-ink-900`}>
      <AppBodyFont className={reportFonts} />
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

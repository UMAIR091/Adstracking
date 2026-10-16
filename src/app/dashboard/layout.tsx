import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionState } from "@/lib/billing/subscription";
import { activeLimits } from "@/lib/billing/limits";
import { getIntegrationHealthCached, summarize } from "@/lib/integrationHealth";
import { clientStatusMap, statusFor } from "@/lib/dashboard/clientStatus";
import { buildGenClients } from "@/lib/dashboard/genClients";
import { GenerateReportDialog } from "@/components/GenerateReportDialog";
import { reportFonts } from "@/lib/reportFonts";
import { Sidebar, type SidebarData } from "@/components/Sidebar";
import { BillingBanner } from "@/components/BillingBanner";
import { CommandPalette } from "@/components/CommandPalette";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { AnalyticsIdentify } from "@/components/AnalyticsIdentify";
import { IncidentBanner } from "@/components/IncidentBanner";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { AppBodyFont } from "@/components/AppBodyFont";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

const planLabel = (plan: string, planName: string) =>
  plan === "trial" ? "Free trial" : `${planName} plan`;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  // First-run guard: send brand-new agencies through onboarding first, so their
  // first report is already white-labeled (journey audit P0-2).
  if (agency && !agency.onboarding_completed_at) redirect("/onboarding");

  const supabase = createClient();

  // Everything the shell shows, in one round: plan and allowance, the
  // integration-health badge, and the active clients — the sidebar's count and
  // three most recently touched (by updated_at; no visit tracking is stored),
  // and the "New report" dialog's client list.
  const [billing, healthRows, clientsRes] = agency
    ? await Promise.all([
        getSubscriptionState(supabase, agency.id),
        getIntegrationHealthCached(agency.id),
        supabase.from("clients").select("id, name, email").eq("archived", false).order("updated_at", { ascending: false }),
      ])
    : [null, [], { data: [] }];

  const activeClients = (clientsRes.data ?? []) as { id: string; name: string; email: string | null }[];
  const statuses = clientStatusMap(healthRows);
  const recent = activeClients.slice(0, 3).map((c) => {
    const st = statusFor(statuses, c.id);
    return { id: c.id, name: c.name, tone: st.tone, statusLabel: st.label };
  });
  const genClients = buildGenClients(
    [...activeClients].sort((a, b) => a.name.localeCompare(b.name)),
    healthRows
  );

  const sidebar: SidebarData = {
    agencyName: agency?.name ?? "My Agency",
    agencyLogo: agency?.logo_url ?? null,
    brandColor: agency?.brand_color ?? null,
    planLabel: billing ? planLabel(billing.plan, billing.planName) : "",
    userEmail: user.email ?? "",
    clientCount: activeClients.length,
    clientLimit: billing ? activeLimits(billing.plan).maxClients : null,
    attentionCount: summarize(healthRows).needsAttention,
    recent,
  };

  // The dashboard CSP carries 'strict-dynamic', which makes the browser
  // ignore the 'self' that lets /theme.js run on the marketing pages — so the
  // same snippet is inlined here with the request nonce. This layout is already
  // dynamic (it awaits the session), so reading the header costs nothing.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <ConfirmProvider>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      <AnalyticsIdentify userId={user.id} email={user.email ?? null} agencyName={agency?.name ?? null} />
      {/* `.app-root` switches on the signed-in palette (globals.css) and carries
          the Geist variables; AppBodyFont extends them to portalled dialogs. */}
      <div className={`app-root ${reportFonts} min-h-screen bg-canvas text-ink-900`}>
        <AppBodyFont className={reportFonts} />
        <IncidentBanner />
        <FeedbackWidget />
        <Sidebar data={sidebar} />
        <div className="lg:pl-[248px]">
          <main className="animate-fade-in mx-auto w-full max-w-[1240px] px-4 pb-[60px] pt-[18px] sm:px-6 lg:px-9 lg:pb-[72px] lg:pt-8">
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
        <GenerateReportDialog clients={genClients} />
        <Toaster position="top-right" toastOptions={{ style: { borderRadius: "12px" } }} richColors />
      </div>
    </ConfirmProvider>
  );
}

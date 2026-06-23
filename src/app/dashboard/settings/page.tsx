import { redirect } from "next/navigation";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { AgencySettingsForm } from "@/components/AgencySettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Settings</h1>
      <p className="mb-6 text-sm text-ink-500">
        This branding appears automatically on every report you send.
      </p>
      <AgencySettingsForm
        agencyId={agency.id}
        initial={{
          name: agency.name ?? "",
          logo_url: agency.logo_url ?? "",
          brand_color: agency.brand_color ?? "#4f46e5",
          website: agency.website ?? "",
          contact_email: agency.contact_email ?? "",
          contact_phone: agency.contact_phone ?? "",
          footer_text: agency.footer_text ?? "",
        }}
      />
    </div>
  );
}

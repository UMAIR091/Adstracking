import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, ChevronRight } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { AgencySettingsForm } from "@/components/AgencySettingsForm";
import { Card, CardContent } from "@/components/ui/card";

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

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-ink-700">Privacy</h2>
        <Link href="/dashboard/settings/data" className="block">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <p className="font-medium text-ink-900">Data &amp; privacy</p>
                  <p className="text-sm text-ink-500">See every connected data source, disconnect integrations, and delete stored data.</p>
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-ink-400" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

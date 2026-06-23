import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { ReportPreview } from "@/components/ReportPreview";

export const dynamic = "force-dynamic";

export default async function ReportPreviewPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  return (
    <div className="space-y-5">
      <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={15} /> Back to reports
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Report preview</h1>
        <p className="text-sm text-ink-500">A live preview using your branding and sample data — this is what clients receive.</p>
      </div>
      <ReportPreview
        branding={{
          name: agency.name,
          logo_url: agency.logo_url,
          brand_color: agency.brand_color,
          website: agency.website,
          footer_text: agency.footer_text,
        }}
      />
    </div>
  );
}

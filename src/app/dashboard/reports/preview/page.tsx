import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Palette } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { Button } from "@/components/ui/button";
import { ReportPreview } from "@/components/ReportPreviewLazy";

export const dynamic = "force-dynamic";

export default async function ReportPreviewPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  return (
    <div className="space-y-6">
      <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={15} /> Back to reports
      </Link>
      {/* Titled "Sample report" to match the links that lead here, and to say
          plainly that the numbers are illustrative while the branding is real
          — the page is a branding preview, not this month's data. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Sample report</h1>
          <p className="text-sm text-ink-500">
            Your real branding on sample figures — this is the layout, cover and structure clients receive.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/settings"><Palette size={16} aria-hidden /> Edit branding</Link>
        </Button>
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

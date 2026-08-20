import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, ChevronRight, Activity, Gauge, HeartPulse } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { AgencySettingsForm } from "@/components/AgencySettingsForm";
import { EmailBrandingSettings } from "@/components/EmailBrandingSettings";
import { getIntegrationHealthCached, summarize } from "@/lib/integrationHealth";

export const dynamic = "force-dynamic";

// One compact row per destination the settings nav already lists. These used to
// be full-width cards repeating the nav verbatim; they're now a quiet summary
// strip whose only job is to carry a real number and hand off to the page that
// owns it. Counts come from the same health rollup the dashboard reads — no
// separate query, and nothing invented.
function SummaryRow({
  href,
  icon: Icon,
  tint,
  label,
  detail,
}: {
  href: string;
  icon: typeof Gauge;
  tint: string;
  label: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-subtle"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}>
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-800">{label}</span>
        <span className="block truncate text-xs text-ink-500">{detail}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-ink-400" aria-hidden />
    </Link>
  );
}

export default async function SettingsPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  // Real counts for the Integrations summary — same rollup, same definition of
  // "needs attention" as the dashboard tile and the health page.
  const health = summarize(await getIntegrationHealthCached(agency.id));

  return (
    <div>
      {/* Title matches this page's entry in SettingsNav — the nav calls it
          "General & branding", so the page shouldn't call itself something
          else once you land on it. */}
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">General &amp; branding</h1>
      <p className="mb-6 text-sm text-ink-500">
        Your logo, colour and contact details go out automatically on every report and email — this is what your
        clients see instead of ReportFlow.
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

      <div className="mt-6">
        <EmailBrandingSettings
          agencyId={agency.id}
          initial={{
            email_sender_name: agency.email_sender_name ?? "",
            email_sender_email: agency.email_sender_email ?? "",
            email_reply_to: agency.email_reply_to ?? "",
            email_footer: agency.email_footer ?? "",
          }}
        />
      </div>

      {/* Elsewhere in settings — a quiet hand-off strip, not a second copy of
          the nav. Each row carries a real fact and links to the page that owns
          it; the full sections live on those pages only. */}
      <div className="mt-10 border-t border-ink-100 pt-5">
        <h2 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
          Elsewhere in settings
        </h2>
        <div className="-mx-3">
          <SummaryRow
            href="/dashboard/integrations"
            icon={HeartPulse}
            tint="bg-success-50 text-success-600"
            label="Integrations"
            detail={
              health.total === 0
                ? "Nothing connected yet — connect a client's first data source"
                : `${health.connected} healthy · ${health.needsAttention} need attention · ${health.total} total`
            }
          />
          <SummaryRow
            href="/dashboard/settings/errors"
            icon={Activity}
            tint="bg-warning-50 text-warning-600"
            label="Sync health"
            detail="Recent sync, connection and report failures across your clients"
          />
          <SummaryRow
            href="/dashboard/settings/usage"
            icon={Gauge}
            tint="bg-info-50 text-info-600"
            label="Usage"
            detail="Reports generated, sync executions and AI usage for this workspace"
          />
          <SummaryRow
            href="/dashboard/settings/data"
            icon={ShieldCheck}
            tint="bg-success-50 text-success-600"
            label="Data & privacy"
            detail="Review connected sources, disconnect integrations, delete stored data"
          />
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Palette } from "lucide-react";

// Nudge shown above report generation/scheduling when the agency hasn't set a
// logo yet (audit P2 #8) — so a client report never goes out unbranded by
// accident. Renders nothing once branding is in place.
export function BrandingNotice({ hasLogo }: { hasLogo: boolean }) {
  if (hasLogo) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <Palette size={18} className="mt-0.5 shrink-0 text-warning-600" />
        <div>
          <p className="text-sm font-medium text-warning-900">Your reports aren&apos;t branded yet</p>
          <p className="text-xs text-warning-700">
            Add your logo, colour and sender details so clients see your agency — not ReportFlow — on every report and email.
          </p>
        </div>
      </div>
      <Link
        href="/dashboard/settings"
        className="shrink-0 rounded-lg border border-warning-300 bg-surface px-3 py-1.5 text-sm font-medium text-warning-800 transition-colors hover:bg-warning-100 focus-ring"
      >
        Set up branding
      </Link>
    </div>
  );
}

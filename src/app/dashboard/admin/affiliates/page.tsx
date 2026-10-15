import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Handshake } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAffiliateSummaries, type Totals } from "@/lib/affiliates/admin";
import { formatMinor } from "@/lib/affiliates/rules";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AffiliateForm } from "./AffiliateForm";

export const dynamic = "force-dynamic";

// Owner-only. Anyone not in ADMIN_EMAILS gets the ordinary 404 — the page's
// existence isn't revealed.
function Money({ totals, status }: { totals: Totals; status: keyof Totals }) {
  const entries = Object.entries(totals[status]);
  if (!entries.length) return <span className="text-ink-400">—</span>;
  return (
    <span className="flex flex-col">
      {entries.map(([cur, minor]) => (
        <span key={cur} className="tabular-nums">{formatMinor(minor, cur)}</span>
      ))}
    </span>
  );
}

export default async function AffiliatesPage() {
  if (!(await requirePlatformAdmin())) notFound();
  const summaries = await loadAffiliateSummaries(createAdminClient());

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info-50 text-info-600">
          <Handshake size={18} />
        </div>
        <div>
          <h1 className="text-[clamp(24px,3vw,28px)] font-semibold tracking-[-0.03em] text-ink-900">Affiliates</h1>
          <p className="text-sm text-ink-500">Referral links, signups and the commissions owed. Payouts are made by hand, then marked paid here.</p>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {summaries.length === 0 ? (
            <p className="p-5 text-sm text-ink-500">No affiliates yet. Create the first one below.</p>
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-2">Affiliate</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-right">Signups</th>
                  <th className="px-4 py-2 text-right">Paying</th>
                  <th className="px-4 py-2">Pending</th>
                  <th className="px-4 py-2">Payable</th>
                  <th className="px-4 py-2">Paid</th>
                  <th className="px-4 py-2">Reversed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {summaries.map(({ affiliate: a, signups, payingAgencies, totals, clawbacks }) => (
                  <tr key={a.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/admin/affiliates/${a.id}`} className="font-medium text-ink-900 hover:underline">{a.name}</Link>
                      <span className="block text-xs text-ink-500">?ref={a.code}</span>
                      {clawbacks > 0 && (
                        <span className="mt-1 flex items-center gap-1 text-xs font-medium text-danger-700">
                          <AlertTriangle size={12} /> {clawbacks} to recover
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={a.status === "active" ? "success" : "muted"} dot>{a.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {a.commission_pct}%
                      <span className="block text-xs text-ink-500">
                        {a.commission_type === "first_payment" ? "first payment" : a.recurring_months ? `${a.recurring_months} mo` : "recurring"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{signups}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{payingAgencies}</td>
                    <td className="px-4 py-3"><Money totals={totals} status="pending" /></td>
                    <td className="px-4 py-3 font-medium text-ink-900"><Money totals={totals} status="payable" /></td>
                    <td className="px-4 py-3"><Money totals={totals} status="paid" /></td>
                    <td className="px-4 py-3"><Money totals={totals} status="reversed" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-3 mt-8 text-sm font-medium text-ink-700">New affiliate</h2>
      <Card>
        <CardContent className="p-5">
          <AffiliateForm />
        </CardContent>
      </Card>
    </div>
  );
}

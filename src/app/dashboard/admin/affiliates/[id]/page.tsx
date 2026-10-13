import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAffiliateDetail, totalsByStatus } from "@/lib/affiliates/admin";
import { effectiveStatus, formatMinor } from "@/lib/affiliates/rules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AffiliateForm } from "../AffiliateForm";
import { CommissionTable, CopyLink, StatusToggle, type CommissionView } from "../AdminWidgets";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

export default async function AffiliateDetailPage({ params }: { params: { id: string } }) {
  if (!(await requirePlatformAdmin())) notFound();
  if (!UUID.test(params.id)) notFound();
  const detail = await loadAffiliateDetail(createAdminClient(), params.id);
  if (!detail) notFound();
  const { affiliate: a, agencies, commissions } = detail;

  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://tryreportflow.com").replace(/\/+$/, "");
  const link = `${siteUrl}/?ref=${a.code}`;
  const now = Date.now();
  const totals = totalsByStatus(commissions, now);
  const rows: CommissionView[] = commissions.map((c) => ({
    id: c.id,
    agencyName: c.agencyName,
    createdAt: c.created_at,
    payableAfter: c.payable_after,
    currency: c.currency,
    netMinor: c.net_amount_minor,
    pct: c.commission_pct,
    amountMinor: c.commission_amount_minor,
    status: effectiveStatus(c.status, c.payable_after, now),
    paidAt: c.paid_at,
    payoutReference: c.payout_reference,
    clawbackNeeded: c.clawback_needed,
    note: c.note,
  }));
  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <div>
      <Link href="/dashboard/admin/affiliates" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={15} /> All affiliates
      </Link>
      <div className="mb-6 mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink-900">
            {a.name} <Badge variant={a.status === "active" ? "success" : "muted"} dot>{a.status}</Badge>
          </h1>
          <p className="text-sm text-ink-500">
            {a.commission_pct}% · {a.commission_type === "first_payment" ? "first payment only" : a.recurring_months ? `recurring for ${a.recurring_months} months` : "recurring, no limit"} · {a.email}
          </p>
        </div>
        <StatusToggle id={a.id} status={a.status} />
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="text-sm font-medium text-ink-700">Referral link</p>
          <CopyLink url={link} />
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-ink-500">Discount code: </dt><dd className="inline text-ink-800">{a.discount_code ?? "—"}</dd></div>
            <div><dt className="inline text-ink-500">Payout: </dt><dd className="inline break-all text-ink-800">{[a.payout_method, a.payout_details].filter(Boolean).join(" · ") || "—"}</dd></div>
          </dl>
        </CardContent>
      </Card>

      <h2 className="mb-3 mt-8 text-sm font-medium text-ink-700">Commissions</h2>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["pending", "payable", "paid", "reversed"] as const).map((s) => (
          <Card key={s}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-ink-500">{s}</p>
              {Object.entries(totals[s]).length ? (
                Object.entries(totals[s]).map(([cur, minor]) => (
                  <p key={cur} className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{formatMinor(minor, cur)}</p>
                ))
              ) : (
                <p className="mt-1 text-lg font-semibold text-ink-400">—</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <CommissionTable affiliateId={a.id} rows={rows} />

      <form action={`/api/admin/affiliates/${a.id}/export`} method="get" className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-sm text-ink-600">Export payable commissions as CSV, created in</span>
        <Input type="month" name="month" defaultValue={thisMonth} className="sm:w-44" />
        <Button type="submit" variant="outline" size="sm"><Download size={14} /> Download CSV</Button>
      </form>
      <p className="mt-1 text-xs text-ink-500">Clear the month to export every payable commission.</p>

      <h2 className="mb-3 mt-8 text-sm font-medium text-ink-700">Referred agencies ({agencies.length})</h2>
      {agencies.length === 0 ? (
        <p className="text-sm text-ink-500">No signups through this link yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2">Agency</th>
                <th className="px-3 py-2">Signed up</th>
                <th className="px-3 py-2">First paid</th>
                <th className="px-3 py-2">Subscription</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {agencies.map((g) => (
                <tr key={g.agencyId}>
                  <td className="px-3 py-2 text-ink-800">
                    {g.name}
                    {g.landingPath && <span className="block text-xs text-ink-500">landed on {g.landingPath}</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-600">{day(g.capturedAt)}</td>
                  <td className="px-3 py-2 text-ink-600">{day(g.firstPaidAt)}</td>
                  <td className="px-3 py-2 text-ink-600">{g.subscriptionStatus ? `${g.subscriptionStatus}${g.plan ? ` · ${g.plan}` : ""}` : "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 mt-8 text-sm font-medium text-ink-700">Edit affiliate</h2>
      <Card>
        <CardContent className="p-5">
          <AffiliateForm id={a.id} initial={a} />
        </CardContent>
      </Card>
    </div>
  );
}

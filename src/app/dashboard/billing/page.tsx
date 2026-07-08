import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Receipt } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionState } from "@/lib/billing/subscription";
import { billingConfigured, getPlans, type BillingInterval } from "@/lib/billing/config";
import { getVariantPrice, listSubscriptionInvoices, type LsInvoice } from "@/lib/billing/lemonsqueezy";
import { BillingPlans, type PlanView } from "@/components/BillingPlans";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "danger" | "muted" | "info" }> = {
  active: { label: "Active", variant: "success" },
  on_trial: { label: "Trial", variant: "info" },
  trial: { label: "Free trial", variant: "info" },
  past_due: { label: "Past due", variant: "warning" },
  paused: { label: "Paused", variant: "warning" },
  unpaid: { label: "Unpaid", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "muted" },
  expired: { label: "Expired", variant: "danger" },
  inactive: { label: "Inactive", variant: "muted" },
};

function fmtDate(iso: string | null): string {
  return iso ? format(new Date(iso), "MMM d, yyyy") : "—";
}

function fmtPrice(cents: number): string {
  return (cents / 100) % 1 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { checkout?: string; portal_error?: string; plan?: string; interval?: string };
}) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const state = await getSubscriptionState(supabase, agency.id);
  const configured = billingConfigured();

  // Live display prices + invoices — parallel, and never block the page on failures.
  const plans = getPlans();
  const [priceMap, invoices] = await Promise.all([
    (async () => {
      const entries = await Promise.all(
        plans.flatMap((p) =>
          (["monthly", "annual"] as BillingInterval[]).map(async (iv) => {
            const v = p.variants[iv];
            if (!v || !configured) return [`${p.id}:${iv}`, null] as const;
            const price = await getVariantPrice(v);
            return [`${p.id}:${iv}`, price ? fmtPrice(price.cents) : null] as const;
          })
        )
      );
      return Object.fromEntries(entries) as Record<string, string | null>;
    })(),
    (async (): Promise<LsInvoice[]> => {
      if (!state.lsSubscriptionId || !configured) return [];
      try {
        return await listSubscriptionInvoices(state.lsSubscriptionId);
      } catch {
        return [];
      }
    })(),
  ]);

  const planViews: PlanView[] = plans.map((p) => ({
    id: p.id,
    name: p.name,
    blurb: p.blurb,
    features: p.features,
    prices: { monthly: priceMap[`${p.id}:monthly`] ?? null, annual: priceMap[`${p.id}:annual`] ?? null },
  }));

  const badge = STATUS_BADGE[state.status] ?? { label: state.status, variant: "muted" as const };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Billing</h1>
        <p className="text-sm text-ink-500">Manage your plan and invoices.</p>
      </div>

      {searchParams.checkout === "success" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          <span>
            Payment received — thank you! Your subscription activates within a few seconds. Refresh if it doesn&apos;t
            appear yet.
          </span>
        </div>
      )}
      {searchParams.portal_error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{searchParams.portal_error}</span>
        </div>
      )}
      {state.paymentFailed && state.hasAccess && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>
            Your last payment failed — we&apos;ll retry automatically.{" "}
            <a href="/api/billing/portal" className="font-medium underline">Update your payment method</a> to avoid
            interruption.
          </span>
        </div>
      )}
      {!state.hasAccess && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{state.blockedReason} Your clients, connections and existing reports are untouched.</span>
        </div>
      )}

      {/* Current plan */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <p className="text-lg font-semibold text-ink-900">{state.planName}</p>
                <Badge variant={badge.variant} dot>{badge.label}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-500">
                {state.plan === "trial" && state.trialDaysLeft !== null
                  ? `${state.trialDaysLeft} day${state.trialDaysLeft === 1 ? "" : "s"} left — ends ${fmtDate(state.trialEndsAt)}`
                  : state.status === "cancelled" && state.endsAt
                    ? `Access until ${fmtDate(state.endsAt)}`
                    : state.renewsAt
                      ? `Renews ${fmtDate(state.renewsAt)}${state.interval ? ` · billed ${state.interval === "annual" ? "annually" : "monthly"}` : ""}`
                      : "No active subscription"}
              </p>
              {state.card && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
                  <CreditCard size={14} className="text-ink-400" />
                  <span className="capitalize">{state.card.brand}</span> ending {state.card.lastFour}
                </p>
              )}
            </div>
            {state.lsSubscriptionId && (
              <Button asChild variant="outline">
                <a href="/api/billing/portal">
                  Manage subscription <ExternalLink size={14} />
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plans */}
      {configured ? (
        <BillingPlans
          plans={planViews}
          currentPlan={state.plan}
          hasSubscription={Boolean(state.lsSubscriptionId)}
          initialInterval={searchParams.interval === "annual" ? "annual" : "monthly"}
          highlightPlan={plans.some((p) => p.id === searchParams.plan) ? searchParams.plan : undefined}
        />
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-ink-500">
            Billing isn&apos;t configured yet. Set <code className="text-ink-700">LEMONSQUEEZY_API_KEY</code>,{" "}
            <code className="text-ink-700">LEMONSQUEEZY_STORE_ID</code> and the variant IDs in your environment to
            enable checkout.
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-ink-700">Invoices</h2>
          <Card>
            <CardContent className="divide-y divide-slate-100 p-0">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                  <span className="flex items-center gap-2.5 text-ink-700">
                    <Receipt size={15} className="text-ink-400" />
                    {fmtDate(inv.attributes.created_at)}
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="font-medium text-ink-800">{inv.attributes.total_formatted}</span>
                    <Badge variant={inv.attributes.status === "paid" ? "success" : inv.attributes.status === "refunded" ? "muted" : "warning"}>
                      {inv.attributes.status_formatted}
                    </Badge>
                    {inv.attributes.urls.invoice_url && (
                      <a href={inv.attributes.urls.invoice_url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 hover:underline">
                        View
                      </a>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-center text-xs text-ink-400">
        Payments are processed securely by Lemon Squeezy (merchant of record). Cancel anytime from{" "}
        {state.lsSubscriptionId ? <a href="/api/billing/portal" className="underline">the customer portal</a> : "the customer portal"} —
        see our <Link href="/terms" className="underline">Terms</Link>.
      </p>
    </div>
  );
}

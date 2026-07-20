import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard, Receipt, RefreshCw } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionState } from "@/lib/billing/subscription";
import { billingConfigured, getPlans, PAID_FEATURES, annualTotal } from "@/lib/billing/config";
import { listInvoices, type InvoiceView } from "@/lib/billing/paddle";
import { BillingPlans, type PlanView } from "@/components/BillingPlans";
import { SubscriptionActions } from "@/components/SubscriptionActions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

// One labelled fact in the subscription summary grid.
function Fact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink-800">
        {icon}
        {value}
      </p>
    </div>
  );
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
  const plans = getPlans();

  // Invoice history is decorative — listInvoices never throws.
  const invoices: InvoiceView[] = state.subscriptionId && configured ? await listInvoices(state.subscriptionId) : [];

  const planViews: PlanView[] = plans.map((p) => ({
    id: p.id,
    name: p.name,
    blurb: `Up to ${p.limits.maxClients} active client${p.limits.maxClients === 1 ? "" : "s"} — every feature included.`,
    features: PAID_FEATURES,
    // Display prices are derived from the same constants the Paddle catalog
    // was built from, so what's shown here is what Paddle charges. Checkout
    // remains authoritative for local currency and tax.
    prices: {
      monthly: p.prices.monthly ? `$${p.priceMonthly}` : null,
      annual: p.prices.annual ? `$${annualTotal(p.priceMonthly).toLocaleString("en-US")}` : null,
    },
    rank: p.priceMonthly,
  }));

  const badge = STATUS_BADGE[state.status] ?? { label: state.status, variant: "muted" as const };
  const cycleLabel = state.interval === "annual" ? "Yearly" : state.interval === "monthly" ? "Monthly" : "—";

  // What the customer should read as "what happens next".
  const renewalLabel = state.cancelAtPeriodEnd
    ? `Ends ${fmtDate(state.endsAt ?? state.renewsAt)}`
    : state.status === "cancelled" && state.endsAt
      ? `Access until ${fmtDate(state.endsAt)}`
      : state.plan === "trial" && state.trialEndsAt
        ? `Trial ends ${fmtDate(state.trialEndsAt)}`
        : state.renewsAt
          ? fmtDate(state.renewsAt)
          : "—";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Billing</h1>
        <p className="text-sm text-ink-500">Manage your plan, payment method and invoices.</p>
      </div>

      {searchParams.checkout === "success" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          <span>Payment received — thank you! Your subscription activates within a few seconds. Refresh if it doesn&apos;t appear yet.</span>
        </div>
      )}
      {searchParams.portal_error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{searchParams.portal_error}</span>
        </div>
      )}
      {state.cancelAtPeriodEnd && state.hasAccess && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <CalendarClock size={17} className="mt-0.5 shrink-0" />
          <span>
            Your subscription is scheduled to end on {fmtDate(state.endsAt ?? state.renewsAt)}. You keep full access until
            then — resume any time to stay subscribed.
          </span>
        </div>
      )}
      {state.paymentFailed && state.hasAccess && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>
            Your last payment failed — we&apos;ll retry automatically.{" "}
            <a href="/api/billing/portal" className="font-medium underline">Update your payment method</a> to avoid interruption.
          </span>
        </div>
      )}
      {!state.hasAccess && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{state.blockedReason} Your clients, connections and existing reports are untouched.</span>
        </div>
      )}

      {/* Current subscription */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <p className="text-lg font-semibold text-ink-900">{state.planName}</p>
                <Badge variant={badge.variant} dot>{badge.label}</Badge>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                <Fact label="Billing cycle" value={cycleLabel} icon={<RefreshCw size={13} className="text-ink-400" />} />
                <Fact
                  label={state.cancelAtPeriodEnd || state.status === "cancelled" ? "Access ends" : "Next renewal"}
                  value={renewalLabel}
                  icon={<CalendarClock size={13} className="text-ink-400" />}
                />
                <Fact
                  label="Payment method"
                  value={state.card ? `${state.card.brand} ending ${state.card.lastFour}` : "Managed by Paddle"}
                  icon={<CreditCard size={13} className="text-ink-400" />}
                />
              </div>

              {state.plan === "trial" && state.trialDaysLeft !== null && (
                <p className="mt-4 text-sm text-ink-500">
                  {state.trialDaysLeft} day{state.trialDaysLeft === 1 ? "" : "s"} left in your free trial. Choose a plan
                  below to continue without interruption.
                </p>
              )}
            </div>

            {state.subscriptionId && (
              <SubscriptionActions
                cancelAtPeriodEnd={state.cancelAtPeriodEnd}
                endsAtLabel={state.endsAt ? fmtDate(state.endsAt) : state.renewsAt ? fmtDate(state.renewsAt) : null}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plans */}
      {configured ? (
        <BillingPlans
          plans={planViews}
          currentPlan={state.plan}
          currentInterval={state.interval}
          hasSubscription={Boolean(state.subscriptionId)}
          initialInterval={searchParams.interval === "annual" ? "annual" : "monthly"}
          highlightPlan={plans.some((p) => p.id === searchParams.plan) ? searchParams.plan : undefined}
        />
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-ink-500">
            Billing isn&apos;t configured yet. Set <code className="text-ink-700">PADDLE_API_KEY</code>,{" "}
            <code className="text-ink-700">PADDLE_CLIENT_TOKEN</code> and the{" "}
            <code className="text-ink-700">PADDLE_PRICE_*</code> variables in your environment to enable checkout.
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
                    {fmtDate(inv.billedAt)}
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="font-medium text-ink-800">{inv.total}</span>
                    <Badge variant={inv.status === "completed" || inv.status === "paid" ? "success" : inv.status === "canceled" ? "muted" : "warning"}>
                      {inv.status}
                    </Badge>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="mt-2 text-xs text-ink-400">
            Full invoices and receipts are available in{" "}
            <a href="/api/billing/portal" className="underline">the billing portal</a>.
          </p>
        </div>
      )}

      <p className="text-center text-xs text-ink-400">
        Payments are processed securely by Paddle, our merchant of record. Cancel any time —{" "}
        see our <Link href="/terms" className="underline">Terms</Link>.
      </p>
    </div>
  );
}

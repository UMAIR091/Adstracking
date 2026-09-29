"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { metaTrack } from "@/lib/metaPixel";

// Serializable plan info prepared by the server (no env access here).
export type PlanView = {
  id: string;
  name: string;
  blurb: string;
  features: string[];
  prices: { monthly: string | null; quarterly: string | null }; // display strings, null = interval unavailable
  rank: number; // price order, so the UI can label upgrade vs downgrade
};

const INTERVAL_LABEL = { monthly: "Monthly", quarterly: "Every 3 months" } as const;
/** The unit a price is quoted per, e.g. "$132.30/quarter". */
const INTERVAL_UNIT = { monthly: "month", quarterly: "quarter" } as const;

type CheckoutSession = {
  transactionId: string;
  clientToken: string;
  environment: "sandbox" | "production";
  trial?: boolean;
};

// The parts of Paddle.js's checkout.completed payload the ad events read.
// Paddle.js reports totals in major units (49, not 4900).
type CompletedCheckout = {
  transaction_id?: string;
  currency_code?: string;
  totals?: { total?: number };
  recurring_totals?: { total?: number };
};

export function BillingPlans({
  plans,
  currentPlan,
  currentInterval,
  previousPlan,
  hasSubscription,
  trialDays = 0,
  initialInterval = "monthly",
  highlightPlan,
  savingPct = null,
  paddleClient,
}: {
  /** Public Paddle.js config, so the payment script can load before the click. */
  paddleClient?: Pick<CheckoutSession, "clientToken" | "environment">;
  plans: PlanView[];
  currentPlan: string; // "trial" | "free" | plan id
  currentInterval?: "monthly" | "quarterly" | null;
  /** The paid plan of a subscription that has ended, offered back first. */
  previousPlan?: string;
  /**
   * A LIVE Paddle subscription exists (not merely a row with an id). Only then
   * can plans be changed in place; otherwise every button is a new checkout.
   */
  hasSubscription: boolean;
  /** Paid-plan trial length, already checked for eligibility; 0 = none. */
  trialDays?: number;
  initialInterval?: "monthly" | "quarterly";
  highlightPlan?: string;
  /** Saving of quarterly vs monthly, derived from Paddle — never a literal. */
  savingPct?: number | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [interval, setInterval] = useState<"monthly" | "quarterly">(initialInterval);
  const [busy, setBusy] = useState<string | null>(null);
  const paddleRef = useRef<Paddle | null>(null);
  const paddleLoadRef = useRef<Promise<Paddle> | null>(null);
  // What the open checkout is, for the Meta event fired when it completes:
  // the eventCallback below is bound once, so it reads this rather than state.
  const openCheckoutRef = useRef<{ plan: string; interval: string; trial: boolean } | null>(null);

  // Paddle.js is loaded on demand (first checkout click) so the billing page
  // itself stays free of third-party script cost. The token and environment
  // come from the server with the transaction, never from a NEXT_PUBLIC_ var.
  // Confirms the purchase server-side, retrying briefly because Paddle can
  // report checkout.completed a moment before it attaches the subscription to
  // the transaction. Falls back to a plain refresh so a confirm failure never
  // strands the customer on a stale page — the webhook may still land.
  const confirmCheckout = useCallback(
    async (transactionId: string | null) => {
      if (!transactionId) {
        setTimeout(() => router.refresh(), 2500);
        return;
      }
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch("/api/billing/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transactionId }),
          });
          const body = await res.json().catch(() => null);
          if (res.ok && body?.ok) {
            router.refresh();
            return;
          }
          if (!body?.pending) break; // a real error — stop retrying
        } catch {
          /* network hiccup — retry */
        }
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      router.refresh();
    },
    [router]
  );

  const getPaddle = useCallback(async (session: Pick<CheckoutSession, "clientToken" | "environment">): Promise<Paddle> => {
    if (paddleRef.current) return paddleRef.current;
    // One in-flight load is shared, so a click during the idle preload waits
    // for it rather than initialising Paddle a second time.
    if (paddleLoadRef.current) return paddleLoadRef.current;
    const load = (async () => {
      const instance = await initializePaddle({
        environment: session.environment,
        token: session.clientToken,
        eventCallback: (ev) => {
          // Paddle fires this once payment is captured. Webhooks remain the
          // authoritative path, but they are delivered by a third party to a
          // destination the app can't verify at runtime — so we ALSO confirm the
          // transaction directly. Without that, a webhook that never arrives
          // leaves a paying customer looking inactive.
          if (ev.name === "checkout.completed") {
            const data = ev.data as CompletedCheckout | undefined;
            const txnId = data?.transaction_id ?? null;
            reportCompletedCheckout(data, openCheckoutRef.current);
            toast.success("Payment received — activating your plan…");
            void confirmCheckout(txnId);
          }
        },
      });
      if (!instance) throw new Error("Couldn't load the payment form. Please disable any ad blocker and retry.");
      paddleRef.current = instance;
      return instance;
    })();
    paddleLoadRef.current = load;
    // A failed load (ad blocker, flaky network) must not be cached — the
    // click retries it and reports the error.
    load.catch(() => { paddleLoadRef.current = null; });
    return load;
  }, [confirmCheckout]);

  // Paddle.js used to load only after the click, in series with creating the
  // transaction. Loading it while the customer reads the plans takes it off
  // the critical path; the click then waits only for the server.
  useEffect(() => {
    if (!paddleClient) return;
    const start = () => { void getPaddle(paddleClient).catch(() => {}); };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(start);
    else setTimeout(start, 500);
  }, [paddleClient, getPaddle]);

  async function startCheckout(planId: string) {
    setBusy(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, interval }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't start checkout");

      const session = body as CheckoutSession;
      const paddle = await getPaddle(session);
      paddle.Checkout.open({ transactionId: session.transactionId });
      openCheckoutRef.current = { plan: planId, interval, trial: Boolean(session.trial) };
      metaTrack("InitiateCheckout", { content_name: planId, content_category: interval }, session.transactionId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Existing subscribers change plan in place — Paddle swaps the price on the
  // one subscription rather than creating a second one.
  async function changePlan(planId: string, planName: string, isUpgrade: boolean) {
    if (!(await confirm({
      title: isUpgrade ? `Upgrade to ${planName}?` : `Change to ${planName}?`,
      description: isUpgrade
        ? "You’ll be charged the prorated difference today."
        : "The lower rate applies from your next renewal.",
      confirmLabel: isUpgrade ? "Upgrade" : "Change plan",
    }))) return;

    setBusy(planId);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change", plan: planId, interval }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't change your plan");
      toast.success(body.message ?? "Plan updated.");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const currentRank = plans.find((p) => p.id === currentPlan)?.rank ?? -1;

  return (
    <div>
      <div className="flex items-center justify-center gap-1 rounded-full border border-ink-200 bg-surface p-1 text-sm" role="group" aria-label="Billing interval">
        {(["monthly", "quarterly"] as const).map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval(iv)}
            aria-pressed={interval === iv}
            className={cn(
              "rounded-full px-4 py-1.5 font-medium transition-colors",
              interval === iv ? "bg-brand-solid text-white" : "text-ink-500 hover:text-ink-800"
            )}
          >
            {INTERVAL_LABEL[iv]}
            {iv === "quarterly" && savingPct != null && savingPct > 0 && (
              <span className={cn("ml-1.5 text-xs", interval === iv ? "text-white/80" : "text-success-600")}>
                save {savingPct}%
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-6 grid max-w-3xl gap-5 sm:grid-cols-2">
        {plans.map((p) => {
          const price = p.prices[interval];
          // "Current" means same plan AND same billing cycle — switching
          // monthly→quarterly on the same tier is still a change.
          const isCurrent = currentPlan === p.id && (!currentInterval || currentInterval === interval);
          const isSamePlanOtherInterval = currentPlan === p.id && !isCurrent;
          const isPicked = highlightPlan === p.id && !isCurrent;
          const isPrevious = !hasSubscription && previousPlan === p.id && !isCurrent;
          const accent = isPicked || (!highlightPlan && (previousPlan ? isPrevious : p.id === "pro"));
          const isUpgrade = p.rank >= currentRank;

          return (
            <Card key={p.id} className={cn("flex flex-col", accent && "border-2 border-brand-500 shadow-md")}>
              <CardContent className="flex flex-1 flex-col p-6">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-ink-900">{p.name}</p>
                  {isCurrent ? (
                    <Badge variant="success">Current plan</Badge>
                  ) : isPicked ? (
                    <Badge>Your pick</Badge>
                  ) : isPrevious ? (
                    <Badge variant="muted">Your previous plan</Badge>
                  ) : (
                    p.id === "pro" && !highlightPlan && !previousPlan && <Badge>Most popular</Badge>
                  )}
                </div>
                <p className="mt-3">
                  <span className="text-3xl font-semibold text-ink-900">{price ?? "—"}</span>{" "}
                  <span className="text-sm text-ink-500">/{INTERVAL_UNIT[interval]}</span>
                </p>
                <p className="mt-1 text-sm text-ink-500">{p.blurb}</p>
                <ul className="mb-6 mt-5 flex-1 space-y-2.5 text-sm text-ink-700">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-success-500" aria-hidden /> {f}
                    </li>
                  ))}
                </ul>

                {isCurrent && hasSubscription ? (
                  <Button variant="outline" asChild>
                    <a href="/api/billing/portal">Manage billing</a>
                  </Button>
                ) : hasSubscription ? (
                  <Button
                    variant={accent ? "default" : "outline"}
                    disabled={!price || busy !== null}
                    onClick={() => changePlan(p.id, p.name, isUpgrade)}
                  >
                    {busy === p.id
                      ? "Updating…"
                      : isSamePlanOtherInterval
                        ? `Switch to ${INTERVAL_LABEL[interval].toLowerCase()}`
                        : isUpgrade
                          ? `Upgrade to ${p.name}`
                          : `Downgrade to ${p.name}`}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant={accent ? "default" : "outline"}
                      disabled={!price || busy !== null}
                      onClick={() => startCheckout(p.id)}
                    >
                      {busy === p.id
                        ? "Opening checkout…"
                        : trialDays > 0
                          ? `Start ${trialDays}-day free trial`
                          : isPrevious || isCurrent
                            ? `Resubscribe to ${p.name}`
                            : `Choose ${p.name}`}
                    </Button>
                    {trialDays > 0 && (
                      <p className="mt-2 text-center text-xs text-ink-500">
                        Free for {trialDays} days, then {price}/{INTERVAL_UNIT[interval]}. Cancel before it ends and
                        you won&apos;t be charged.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// Meta Pixel conversion for a completed checkout, keyed on the Paddle
// transaction id so the server's Purchase for the same transaction
// (lib/metaCapi.ts) is deduplicated against it. A trial checkout charges
// nothing today: it is a StartTrial, and the paid conversion is reported by the
// server when Paddle takes the first payment.
function reportCompletedCheckout(
  data: CompletedCheckout | undefined,
  open: { plan: string; interval: string; trial: boolean } | null
): void {
  const txnId = data?.transaction_id;
  if (!txnId) return;
  const currency = data?.currency_code ?? "USD";
  const total = Number(data?.totals?.total ?? 0);
  const content = { content_name: open?.plan, content_category: open?.interval };
  if (open?.trial || !(total > 0)) {
    const recurring = Number(data?.recurring_totals?.total ?? 0);
    metaTrack("StartTrial", { ...content, value: 0, currency, predicted_ltv: recurring > 0 ? recurring : undefined }, txnId);
  } else {
    metaTrack("Purchase", { ...content, value: total, currency }, txnId);
  }
}

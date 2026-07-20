"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Serializable plan info prepared by the server (no env access here).
export type PlanView = {
  id: string;
  name: string;
  blurb: string;
  features: string[];
  prices: { monthly: string | null; annual: string | null }; // display strings, null = interval unavailable
  rank: number; // price order, so the UI can label upgrade vs downgrade
};

type CheckoutSession = {
  transactionId: string;
  clientToken: string;
  environment: "sandbox" | "production";
};

export function BillingPlans({
  plans,
  currentPlan,
  currentInterval,
  hasSubscription,
  trialDays = 0,
  initialInterval = "monthly",
  highlightPlan,
}: {
  plans: PlanView[];
  currentPlan: string; // "trial" | "free" | plan id
  currentInterval?: "monthly" | "annual" | null;
  hasSubscription: boolean; // a manageable Paddle subscription exists
  /** Paid-plan trial length, already checked for eligibility; 0 = none. */
  trialDays?: number;
  initialInterval?: "monthly" | "annual";
  highlightPlan?: string;
}) {
  const router = useRouter();
  const [interval, setInterval] = useState<"monthly" | "annual">(initialInterval);
  const [busy, setBusy] = useState<string | null>(null);
  const paddleRef = useRef<Paddle | null>(null);

  // Paddle.js is loaded on demand (first checkout click) so the billing page
  // itself stays free of third-party script cost. The token and environment
  // come from the server with the transaction, never from a NEXT_PUBLIC_ var.
  const getPaddle = useCallback(async (session: CheckoutSession): Promise<Paddle> => {
    if (paddleRef.current) return paddleRef.current;
    const instance = await initializePaddle({
      environment: session.environment,
      token: session.clientToken,
      eventCallback: (ev) => {
        // Paddle fires this once payment is captured. The webhook is the
        // source of truth, so we just refresh to pick up the new state.
        if (ev.name === "checkout.completed") {
          toast.success("Payment received — activating your plan…");
          setTimeout(() => router.refresh(), 2500);
        }
      },
    });
    if (!instance) throw new Error("Couldn't load the payment form. Please disable any ad blocker and retry.");
    paddleRef.current = instance;
    return instance;
  }, [router]);

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
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Existing subscribers change plan in place — Paddle swaps the price on the
  // one subscription rather than creating a second one.
  async function changePlan(planId: string, planName: string, isUpgrade: boolean) {
    if (!window.confirm(
      isUpgrade
        ? `Upgrade to ${planName}? You'll be charged the prorated difference today.`
        : `Change to ${planName}? The lower rate applies from your next renewal.`
    )) return;

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
      <div className="flex items-center justify-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-sm" role="group" aria-label="Billing interval">
        {(["monthly", "annual"] as const).map((iv) => (
          <button
            key={iv}
            onClick={() => setInterval(iv)}
            aria-pressed={interval === iv}
            className={cn(
              "rounded-full px-4 py-1.5 font-medium capitalize transition-colors",
              interval === iv ? "bg-brand-500 text-white" : "text-ink-500 hover:text-ink-800"
            )}
          >
            {iv}
            {iv === "annual" && <span className={cn("ml-1.5 text-xs", interval === iv ? "text-white/80" : "text-emerald-600")}>save ~20%</span>}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-6 grid max-w-3xl gap-5 sm:grid-cols-2">
        {plans.map((p) => {
          const price = p.prices[interval];
          // "Current" means same plan AND same billing cycle — switching
          // monthly→annual on the same tier is still a change.
          const isCurrent = currentPlan === p.id && (!currentInterval || currentInterval === interval);
          const isSamePlanOtherInterval = currentPlan === p.id && !isCurrent;
          const isPicked = highlightPlan === p.id && !isCurrent;
          const accent = isPicked || (p.id === "pro" && !highlightPlan);
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
                  ) : (
                    p.id === "pro" && !highlightPlan && <Badge>Most popular</Badge>
                  )}
                </div>
                <p className="mt-3">
                  <span className="text-3xl font-semibold text-ink-900">{price ?? "—"}</span>{" "}
                  <span className="text-sm text-ink-500">/{interval === "monthly" ? "month" : "year"}</span>
                </p>
                <p className="mt-1 text-sm text-ink-500">{p.blurb}</p>
                <ul className="mb-6 mt-5 flex-1 space-y-2.5 text-sm text-ink-700">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden /> {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
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
                        ? `Switch to ${interval}`
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
                          : `Choose ${p.name}`}
                    </Button>
                    {trialDays > 0 && (
                      <p className="mt-2 text-center text-xs text-ink-400">
                        Free for {trialDays} days, then {price}/{interval === "monthly" ? "month" : "year"}. Cancel
                        before it ends and you won&apos;t be charged.
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

"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
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
};

export function BillingPlans({
  plans,
  currentPlan,
  hasSubscription,
  initialInterval = "monthly",
  highlightPlan,
}: {
  plans: PlanView[];
  currentPlan: string; // "trial" | "free" | plan id
  hasSubscription: boolean; // an LS subscription exists (any status)
  initialInterval?: "monthly" | "annual"; // preselected from ?interval= (pricing page carry-through)
  highlightPlan?: string; // plan chosen on the public pricing page (?plan=)
}) {
  const [interval, setInterval] = useState<"monthly" | "annual">(initialInterval);
  const [busy, setBusy] = useState<string | null>(null);

  async function checkout(planId: string) {
    setBusy(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, interval }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't start checkout");
      window.location.href = body.url as string;
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(null);
    }
  }

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
          const isCurrent = currentPlan === p.id;
          const isPicked = highlightPlan === p.id && !isCurrent;
          const accent = isPicked || (p.id === "pro" && !highlightPlan);
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
                    <a href="/api/billing/portal">Manage subscription</a>
                  </Button>
                ) : hasSubscription ? (
                  // Plan changes for existing subscribers happen in the LS
                  // portal so we never create a second subscription.
                  <Button variant={accent ? "default" : "outline"} asChild>
                    <a href="/api/billing/portal">Switch plan in portal</a>
                  </Button>
                ) : (
                  <Button
                    variant={accent ? "default" : "outline"}
                    disabled={!price || busy !== null}
                    onClick={() => checkout(p.id)}
                  >
                    {busy === p.id ? "Opening checkout…" : `Upgrade to ${p.name}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

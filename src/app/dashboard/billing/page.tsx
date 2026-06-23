import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SoonButton } from "@/components/SoonButton";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    current: true,
    features: ["1 client", "Google Search Console", "PDF & online reports", "ReportFlow branding"],
  },
  {
    name: "Pro",
    price: "$29",
    cadence: "per month",
    highlight: true,
    features: ["Unlimited clients", "All integrations", "Full white-label", "Scheduled & automated reports", "Email delivery + tracking"],
  },
  {
    name: "Pro Annual",
    price: "$290",
    cadence: "per year",
    features: ["Everything in Pro", "2 months free", "Priority support"],
  },
];

export default async function BillingPage() {
  const { user } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Billing</h1>
        <p className="text-sm text-ink-500">Simple flat pricing — unlimited clients, no per-client fees.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.name} className={cn("flex flex-col", p.highlight && "border-2 border-brand-500 shadow-md")}>
            <CardContent className="flex flex-1 flex-col p-6">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink-900">{p.name}</p>
                {p.current && <Badge variant="muted">Current</Badge>}
                {p.highlight && <Badge variant="default">Most popular</Badge>}
              </div>
              <p className="mt-3">
                <span className="text-3xl font-semibold text-ink-900">{p.price}</span>{" "}
                <span className="text-sm text-ink-500">{p.cadence}</span>
              </p>
              <ul className="mb-6 mt-5 flex-1 space-y-2.5 text-sm text-ink-700">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check size={16} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              {p.current ? (
                <button disabled className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-ink-400">
                  Your current plan
                </button>
              ) : (
                <SoonButton message="Checkout via Lemon Squeezy is coming with the billing phase." className="w-full" size="lg" variant={p.highlight ? "default" : "outline"}>
                  Upgrade to {p.name}
                </SoonButton>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-ink-400">Payments processed securely via Lemon Squeezy. Cancel anytime.</p>
    </div>
  );
}

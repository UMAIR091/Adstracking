// Billing plan catalog. Variant IDs come from environment variables so the
// same code runs against Lemon Squeezy test mode and production stores.
// A plan/interval renders in the UI only when its variant ID is configured,
// so Team can be added later by just setting two env vars.

export type PlanId = "starter" | "pro" | "agency" | "enterprise" | "team";
export type BillingInterval = "monthly" | "annual";

export const TRIAL_DAYS = 14;

export type PlanDef = {
  id: PlanId;
  name: string;
  blurb: string;
  features: string[];
  variants: Partial<Record<BillingInterval, string>>; // interval -> LS variant id
};

function env(key: string): string | undefined {
  return process.env[key] || undefined;
}

export function getPlans(): PlanDef[] {
  const plans: PlanDef[] = [
    {
      id: "starter",
      name: "Starter",
      blurb: "Every feature, up to 5 active clients.",
      features: [
        "Up to 5 active clients",
        "Unlimited reports & schedules",
        "AI insights on every report",
        "Full white-label branding",
        "Every integration, as it launches",
      ],
      variants: {
        monthly: env("LEMONSQUEEZY_VARIANT_ID_STARTER_MONTHLY"),
        annual: env("LEMONSQUEEZY_VARIANT_ID_STARTER_ANNUAL"),
      },
    },
    {
      id: "pro",
      name: "Pro",
      blurb: "Everything an agency needs — flat price, unlimited clients.",
      features: [
        "Unlimited clients & reports",
        "AI insights on every report",
        "Full white-label branding",
        "Scheduled delivery with PDF attachments",
        "Every integration, as it launches",
      ],
      variants: {
        // Fall back to the legacy env names so an existing store keeps working.
        monthly: env("LEMONSQUEEZY_VARIANT_ID_PRO_MONTHLY") ?? env("LEMONSQUEEZY_VARIANT_ID_MONTHLY"),
        annual: env("LEMONSQUEEZY_VARIANT_ID_PRO_ANNUAL") ?? env("LEMONSQUEEZY_VARIANT_ID_ANNUAL"),
      },
    },
    {
      id: "agency",
      name: "Agency",
      blurb: "Every feature, up to 50 active clients.",
      features: [
        "Up to 50 active clients",
        "Unlimited reports & schedules",
        "AI insights on every report",
        "Full white-label branding",
        "Every integration, as it launches",
      ],
      variants: {
        monthly: env("LEMONSQUEEZY_VARIANT_ID_AGENCY_MONTHLY"),
        annual: env("LEMONSQUEEZY_VARIANT_ID_AGENCY_ANNUAL"),
      },
    },
    {
      id: "enterprise",
      name: "Enterprise",
      blurb: "Every feature, unlimited active clients.",
      features: [
        "Unlimited active clients",
        "Unlimited reports & schedules",
        "AI insights on every report",
        "Full white-label branding",
        "Every integration, as it launches",
      ],
      variants: {
        monthly: env("LEMONSQUEEZY_VARIANT_ID_ENTERPRISE_MONTHLY"),
        annual: env("LEMONSQUEEZY_VARIANT_ID_ENTERPRISE_ANNUAL"),
      },
    },
    {
      id: "team",
      name: "Team",
      blurb: "For growing agencies — everything in Pro, plus team features as they ship.",
      features: [
        "Everything in Pro",
        "Team seats (rolling out)",
        "Priority support",
      ],
      variants: {
        monthly: env("LEMONSQUEEZY_VARIANT_ID_TEAM_MONTHLY"),
        annual: env("LEMONSQUEEZY_VARIANT_ID_TEAM_ANNUAL"),
      },
    },
  ];
  // Only offer plans that have at least one purchasable variant.
  return plans.filter((p) => p.variants.monthly || p.variants.annual);
}

export function findVariant(plan: PlanId, interval: BillingInterval): string | undefined {
  return getPlans().find((p) => p.id === plan)?.variants[interval];
}

// Reverse lookup for webhooks: which plan/interval does a variant id belong to?
export function planForVariant(variantId: string): { plan: PlanId; interval: BillingInterval } | null {
  for (const p of getPlans()) {
    for (const interval of ["monthly", "annual"] as const) {
      if (p.variants[interval] === variantId) return { plan: p.id, interval };
    }
  }
  return null;
}

export function billingConfigured(): boolean {
  return Boolean(process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID && getPlans().length > 0);
}

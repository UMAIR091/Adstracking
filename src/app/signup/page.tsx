import { AuthForm } from "@/components/AuthForm";
import { AuthLegalNote } from "@/components/AuthLegalNote";

// Pricing CTAs land here as /signup?plan=<id>&interval=<monthly|annual>.
// Carry that choice through auth so the billing page can preselect it.
const KNOWN_PLANS = new Set(["starter", "pro", "agency", "enterprise", "team"]);

export default function SignupPage({
  searchParams,
}: {
  searchParams: { plan?: string; interval?: string };
}) {
  const plan = searchParams.plan && KNOWN_PLANS.has(searchParams.plan) ? searchParams.plan : null;
  const interval = searchParams.interval === "annual" ? "annual" : "monthly";
  const next = plan ? `/dashboard/billing?plan=${plan}&interval=${interval}` : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <AuthForm mode="signup" next={next} />
      <AuthLegalNote />
    </main>
  );
}

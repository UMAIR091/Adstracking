import { AuthForm } from "@/components/AuthForm";
import { AuthLegalNote } from "@/components/AuthLegalNote";
import { safeNext } from "@/lib/safeNext";

// Pricing CTAs land here as /signup?plan=<id>&interval=<monthly|quarterly>.
// Carry that choice through auth so the billing page can preselect it.
const KNOWN_PLANS = new Set(["starter", "pro", "agency", "enterprise", "team"]);

export default function SignupPage({
  searchParams,
}: {
  searchParams: { plan?: string; interval?: string; next?: string };
}) {
  const plan = searchParams.plan && KNOWN_PLANS.has(searchParams.plan) ? searchParams.plan : null;
  // "annual" is still honoured so an old bookmarked pricing link keeps working;
  // it resolves to the quarterly plan, which is what those prices now are.
  const interval = searchParams.interval === "quarterly" || searchParams.interval === "annual" ? "quarterly" : "monthly";

  // An explicit ?next wins over the pricing hand-off: it means the visitor was
  // sent here mid-flow (accepting a team invite), and dropping it would strand
  // them on the dashboard with no idea the invite went unaccepted.
  const next = searchParams.next
    ? safeNext(searchParams.next)
    : plan
      ? `/dashboard/billing?plan=${plan}&interval=${interval}`
      : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <AuthForm mode="signup" next={next} />
      <AuthLegalNote />
    </main>
  );
}

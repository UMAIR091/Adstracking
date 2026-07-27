import { AuthForm } from "@/components/AuthForm";
import { AuthLegalNote } from "@/components/AuthLegalNote";
import { safeNext } from "@/lib/safeNext";

// `next` carries the caller's intended destination through sign-in — used by
// the team-invite flow (/invite/<token>), which needs the visitor to return to
// the token after authenticating. Validated to same-site paths only.
export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <AuthForm mode="login" next={safeNext(searchParams.next)} />
      <AuthLegalNote />
    </main>
  );
}

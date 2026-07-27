import Link from "next/link";
import { redirect } from "next/navigation";
import { XCircle, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceptInvitation, hashInviteToken } from "@/lib/team";
import { captureServer } from "@/lib/analyticsServer";
import { ANALYTICS } from "@/lib/analytics";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

// Accepting happens on load rather than behind a second button: the recipient
// already expressed intent by clicking a link in their own inbox, and the
// acceptance is idempotent, so an extra confirmation step would only add a
// place to drop out.
export default async function InvitePage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();

  // Signed out — send them to sign in, then straight back here. The token stays
  // in the return path so the flow resumes exactly where it left off.
  if (!user) {
    const next = encodeURIComponent(`/invite/${params.token}`);

    // Look up the invited address (service role: the visitor is nobody yet) so
    // the sign-in page can tell them WHICH account to use. Without this, an
    // invitee with two addresses signs in with the wrong one and hits a
    // mismatch error they can't explain.
    const { data: invite } = await admin
      .from("invitations")
      .select("email, status, agencies(name)")
      .eq("token_hash", hashInviteToken(params.token))
      .maybeSingle();

    // Supabase types a to-one join as an object or a single-element array
    // depending on the query shape, so both are normalised.
    const joined: unknown = invite?.agencies;
    const agencyName = Array.isArray(joined)
      ? (joined[0] as { name?: string } | undefined)?.name
      : (joined as { name?: string } | null | undefined)?.name;

    return (
      <Shell>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <LogIn size={20} aria-hidden />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink-900">
          {agencyName ? `Join ${agencyName} on ReportFlow` : "Accept your invitation"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          {invite?.email ? (
            <>
              Sign in as <span className="font-medium text-ink-900">{invite.email}</span> to accept. The invitation only
              works for that address.
            </>
          ) : (
            <>Sign in to accept this invitation.</>
          )}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/login?next=${next}`}>Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/signup?next=${next}`}>Create an account</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const result = await acceptInvitation(admin, {
    token: params.token,
    userId: user.id,
    userEmail: user.email,
  });

  if (result.ok) {
    await captureServer(user.id, ANALYTICS.teamInviteAccepted, {});
    redirect("/dashboard?joined=1");
  }

  return (
    <Shell>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
        <XCircle size={20} aria-hidden />
      </div>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink-900">This invitation can&apos;t be used</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{result.message}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to your dashboard</Link>
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="p-7">{children}</CardContent>
      </Card>
    </main>
  );
}

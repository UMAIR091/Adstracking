import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { ConnectStatusToast } from "@/components/ConnectStatusToast";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ClientTabs } from "@/components/ClientTabs";

export const dynamic = "force-dynamic";

// The client workspace shell: identity and navigation, held across every tab.
//
// The header and its actions are exactly what the single client page carried at
// the top; they now live in a layout so they survive navigation between
// sections rather than being re-mounted by each one. `edit` deliberately sits
// outside this group — it has its own page chrome and is not a workspace tab.
export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, website, email")
    .eq("id", params.id)
    .maybeSingle();
  if (!client) notFound();

  return (
    <div>
      {/* Connect callbacks can land on any tab, so the toast lives with the
          shell rather than with one section. */}
      <Suspense fallback={null}>
        <ConnectStatusToast />
      </Suspense>

      <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={15} /> Back to clients
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{client.name}</h1>
          <p className="text-sm text-ink-500">{client.website || client.email || "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/reports/preview"><Eye size={16} /> Sample report</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/clients/${client.id}/edit`}>Edit client</Link>
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <ClientTabs clientId={client.id as string} />
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}

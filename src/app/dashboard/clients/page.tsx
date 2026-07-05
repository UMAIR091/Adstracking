import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ClientsList, type ClientRow } from "@/components/ClientsList";
import { ConnectStatusToast } from "@/components/ConnectStatusToast";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, name, logo_url, email, website, notes, archived, data_sources(type, updated_at)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <ConnectStatusToast />
      </Suspense>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Clients</h1>
          <p className="text-sm text-ink-500">Add the clients you report for.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/clients/new">
            <Plus size={18} /> Add client
          </Link>
        </Button>
      </div>

      <ClientsList clients={(data ?? []) as ClientRow[]} />
    </div>
  );
}

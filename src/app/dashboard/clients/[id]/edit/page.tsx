import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { ClientForm, type ClientValues } from "@/components/ClientForm";

export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, logo_url, email, website, notes")
    .eq("id", params.id)
    .maybeSingle();

  if (!client) notFound();

  const initial: ClientValues = {
    id: client.id,
    name: client.name ?? "",
    logo_url: client.logo_url ?? "",
    email: client.email ?? "",
    website: client.website ?? "",
    notes: client.notes ?? "",
  };

  return (
    <div>
      <Link href="/dashboard/clients" className="text-sm text-ink-500 hover:text-ink-700">← Back to clients</Link>
      <h1 className="mb-5 mt-3 text-2xl font-semibold tracking-tight text-ink-900">Edit client</h1>
      <ClientForm agencyId={agency.id} initial={initial} />
    </div>
  );
}

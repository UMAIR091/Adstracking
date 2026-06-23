import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { ClientForm } from "@/components/ClientForm";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  return (
    <div>
      <Link href="/dashboard/clients" className="text-sm text-ink-500 hover:text-ink-700">← Back to clients</Link>
      <h1 className="mb-5 mt-3 text-2xl font-semibold tracking-tight text-ink-900">Add a client</h1>
      <ClientForm agencyId={agency.id} />
    </div>
  );
}

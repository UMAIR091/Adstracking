import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShieldCheck, Eye, Trash2, ArrowRight } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { getIntegration } from "@/lib/integrations/registry";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { COMPANY, DATA_PROMISE } from "@/lib/company";

export const dynamic = "force-dynamic";

// Pre-OAuth consent screen: explains exactly what data the integration reads,
// why, how it's stored, and how to revoke — before the user is sent to the
// provider's authorization page. Registry-driven, so it works for every
// current and future live integration.
export default async function ConnectConsentPage({
  params,
  searchParams,
}: {
  params: { type: string };
  searchParams: { clientId?: string };
}) {
  const { user } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  const def = getIntegration(params.type);
  const clientId = searchParams.clientId;
  if (!def || def.status !== "live" || !def.connectPath || !clientId) notFound();

  const supabase = createClient();
  const { data: client } = await supabase.from("clients").select("id, name").eq("id", clientId).single();
  if (!client) notFound();

  const continueHref = `${def.connectPath}?clientId=${client.id}&type=${def.id}`;
  const backHref = `/dashboard/clients/${client.id}`;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Connect {def.name}</h1>
      <p className="mt-1 text-sm text-ink-500">
        For <span className="font-medium text-ink-700">{client.name}</span> — review what {COMPANY.product} will access
        before continuing.
      </p>

      <Card className="mt-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Eye size={16} className="text-brand-600" /> What we&apos;ll access, and why
          </div>
          <ul className="mt-4 space-y-4">
            {(def.dataAccess ?? []).map((d) => (
              <li key={d.item}>
                <p className="text-sm font-medium text-ink-800">{d.item}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-500">{d.why}</p>
              </li>
            ))}
          </ul>

          <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm text-ink-600">
            <p className="flex items-start gap-2">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              <span>
                Access is <strong>read-only</strong> — {COMPANY.product} can never change anything in your {def.name}{" "}
                account. Connection tokens are encrypted (AES-256-GCM) before storage. {DATA_PROMISE}
              </span>
            </p>
            <p className="flex items-start gap-2">
              <Trash2 size={16} className="mt-0.5 shrink-0 text-ink-400" />
              <span>
                You can disconnect at any time from the client&apos;s page or{" "}
                <Link href="/dashboard/settings/data" className="font-medium text-brand-600 hover:underline">
                  Settings → Data &amp; privacy
                </Link>
                , which immediately deletes the stored tokens and all cached data for this source.
              </span>
            </p>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-400">
              By continuing you agree to our{" "}
              <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link> and{" "}
              <Link href="/security" className="text-brand-600 hover:underline">data practices</Link>.
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href={backHref}>Cancel</Link>
              </Button>
              <Button asChild>
                <a href={continueHref}>
                  Continue to {def.name} <ArrowRight size={16} />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

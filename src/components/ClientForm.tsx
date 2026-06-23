"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ClientValues = {
  id?: string;
  name: string;
  logo_url: string;
  email: string;
  website: string;
  notes: string;
};

export function ClientForm({ agencyId, initial }: { agencyId: string; initial?: ClientValues }) {
  const router = useRouter();
  const supabase = createClient();
  const isEdit = Boolean(initial?.id);
  const [v, setV] = useState<ClientValues>(initial ?? { name: "", logo_url: "", email: "", website: "", notes: "" });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ClientValues>(k: K, val: ClientValues[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const row = {
      name: v.name.trim(),
      logo_url: v.logo_url.trim() || null,
      email: v.email.trim() || null,
      website: v.website.trim() || null,
      notes: v.notes.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from("clients").update(row).eq("id", initial!.id)
      : await supabase.from("clients").insert({ ...row, agency_id: agencyId });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isEdit ? "Client updated" : "Client added");
    router.push("/dashboard/clients");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Client information</CardTitle>
          <CardDescription>Basic details for this client.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>Client name *</Label>
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label>Website</Label>
              <Input placeholder="https://client.com" value={v.website} onChange={(e) => set("website", e.target.value)} />
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input placeholder="https://…/logo.png" value={v.logo_url} onChange={(e) => set("logo_url", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact information</CardTitle>
          <CardDescription>Where reports and updates are sent.</CardDescription>
        </CardHeader>
        <CardContent>
          <Label>Contact email</Label>
          <Input type="email" placeholder="client@company.com" value={v.email} onChange={(e) => set("email", e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reporting preferences</CardTitle>
          <CardDescription>Internal notes about this client&apos;s reporting.</CardDescription>
        </CardHeader>
        <CardContent>
          <Label>Notes</Label>
          <Textarea rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving} size="lg">
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add client"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/dashboard/clients">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

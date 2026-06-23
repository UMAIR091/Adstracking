"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoUpload } from "@/components/LogoUpload";

type Values = {
  name: string;
  logo_url: string;
  brand_color: string;
  website: string;
  contact_email: string;
  contact_phone: string;
  footer_text: string;
};

export function AgencySettingsForm({ agencyId, initial }: { agencyId: string; initial: Values }) {
  const router = useRouter();
  const supabase = createClient();
  const [v, setV] = useState<Values>(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Values>(k: K, val: Values[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("agencies")
      .update({
        name: v.name.trim() || "My Agency",
        logo_url: v.logo_url.trim() || null,
        brand_color: v.brand_color,
        website: v.website.trim() || null,
        contact_email: v.contact_email.trim() || null,
        contact_phone: v.contact_phone.trim() || null,
        footer_text: v.footer_text.trim() || null,
      })
      .eq("id", agencyId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: form sections */}
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Agency branding</CardTitle>
            <CardDescription>Your logo and color appear on every report.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label>Agency name</Label>
              <Input value={v.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <Label>Logo</Label>
              <LogoUpload value={v.logo_url} onChange={(url) => set("logo_url", url)} folder={agencyId} />
            </div>
            <div>
              <Label>Brand color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={v.brand_color} onChange={(e) => set("brand_color", e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300" />
                <Input value={v.brand_color} onChange={(e) => set("brand_color", e.target.value)} className="max-w-[160px]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact information</CardTitle>
            <CardDescription>Shown on reports so clients can reach you.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label>Website</Label>
              <Input placeholder="https://youragency.com" value={v.website} onChange={(e) => set("website", e.target.value)} />
            </div>
            <div>
              <Label>Contact email</Label>
              <Input type="email" value={v.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
            </div>
            <div>
              <Label>Contact phone</Label>
              <Input value={v.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Report branding</CardTitle>
            <CardDescription>The footer line at the bottom of each report.</CardDescription>
          </CardHeader>
          <CardContent>
            <Label>Footer text</Label>
            <Input placeholder="Prepared by Your Agency" value={v.footer_text} onChange={(e) => set("footer_text", e.target.value)} />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} size="lg">
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>

      {/* Right: live preview */}
      <div className="lg:col-span-1">
        <div className="lg:sticky lg:top-8">
          <p className="mb-2 text-sm font-medium text-ink-500">Live preview</p>
          <BrandingPreview values={v} />
        </div>
      </div>
    </div>
  );
}

function BrandingPreview({ values }: { values: Values }) {
  return (
    <Card className="overflow-hidden">
      <div className="h-2 w-full" style={{ background: values.brand_color }} />
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
            {values.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={values.logo_url} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-lg font-semibold" style={{ color: values.brand_color }}>
                {(values.name || "A").charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <p className="font-semibold text-ink-900">{values.name || "Your Agency"}</p>
            <p className="text-xs text-ink-500">SEO Performance Report</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {[
            { l: "Clicks", v: "1,284" },
            { l: "Impressions", v: "48.2k" },
          ].map((m) => (
            <div key={m.l} className="rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] text-ink-500">{m.l}</p>
              <p className="text-lg font-semibold" style={{ color: values.brand_color }}>{m.v}</p>
            </div>
          ))}
        </div>

        <p className="mt-5 border-t border-slate-100 pt-3 text-center text-[11px] text-ink-400">
          {values.footer_text || `Prepared by ${values.name || "Your Agency"}`}
        </p>
      </CardContent>
    </Card>
  );
}

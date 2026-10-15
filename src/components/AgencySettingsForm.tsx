"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoUpload } from "@/components/LogoUpload";
import { cn } from "@/lib/utils";

type Values = {
  name: string;
  logo_url: string;
  brand_color: string;
  website: string;
  contact_email: string;
  contact_phone: string;
  footer_text: string;
};

/** Saved email-sender settings, so the preview shows how the email will read. */
export type EmailPreview = { senderName: string; senderEmail: string };

// Quick picks beside the full colour picker and hex field.
const SWATCHES = ["#4F46E5", "#0F7A6C", "#2563EB", "#0891B2", "#7C3AED", "#DB2777", "#DC2626", "#C2410C", "#12171C"];

export function AgencySettingsForm({
  agencyId,
  initial,
  email,
}: {
  agencyId: string;
  initial: Values;
  email?: EmailPreview;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [v, setV] = useState<Values>(initial);
  const [saving, setSaving] = useState(false);
  // Unsaved edits show in the preview immediately, but the full-report preview
  // reads from the database — so it's worth saying which is which.
  const dirty = (Object.keys(initial) as (keyof Values)[]).some((k) => v[k] !== initial[k]);

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
    <div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left: form sections */}
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Agency branding</CardTitle>
              <CardDescription>Shown on every report, PDF and email instead of Anavyst.</CardDescription>
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
                <Label>Brand colour</Label>
                <div role="radiogroup" aria-label="Brand colour" className="mt-1 flex flex-wrap items-center gap-2">
                  {SWATCHES.map((c) => {
                    const on = v.brand_color.toLowerCase() === c.toLowerCase();
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={c}
                        onClick={() => set("brand_color", c)}
                        className="h-[30px] w-[30px] rounded-lg transition-shadow"
                        style={{ background: c, boxShadow: on ? `0 0 0 2px rgb(var(--surface)), 0 0 0 4px ${c}` : undefined }}
                      />
                    );
                  })}
                  <input
                    type="color"
                    aria-label="Pick any colour"
                    value={v.brand_color}
                    onChange={(e) => set("brand_color", e.target.value)}
                    className="h-[30px] w-9 cursor-pointer rounded-lg border border-control-line bg-surface p-0.5"
                  />
                  <Input
                    aria-label="Brand colour hex"
                    value={v.brand_color}
                    onChange={(e) => set("brand_color", e.target.value)}
                    className="h-[30px] w-[110px] font-app-mono text-[12.5px]"
                  />
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
              <CardTitle>Report footer</CardTitle>
              <CardDescription>The line at the bottom of each report.</CardDescription>
            </CardHeader>
            <CardContent>
              <Label>Footer text</Label>
              <Input placeholder="Prepared by Your Agency" value={v.footer_text} onChange={(e) => set("footer_text", e.target.value)} />
            </CardContent>
          </Card>
        </div>

        {/* Right: live preview of what clients receive. It follows the form as
            you type; the full report uses saved branding, hence the note. */}
        <div className="flex flex-col gap-3 xl:sticky xl:top-5">
          <p className="font-app-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-400">Live preview</p>
          <BrandingPreview values={v} />
          <EmailPreviewCard values={v} email={email} />
          <Link href="/dashboard/reports/preview" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:text-ink-900">
            See it on a full report <ArrowRight size={14} aria-hidden />
          </Link>
          {dirty && <p className="text-xs text-ink-500">Save first — the full report uses your saved branding.</p>}
        </div>
      </div>

      {/* Appears only with unsaved changes, and stays in reach while scrolling. */}
      {dirty && (
        <div className="sticky bottom-4 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-nav-bg px-4 py-3 text-nav-mark shadow-lg [--ring:var(--nav-electric)]">
          <span className="text-[13.5px]">Changes apply to future reports and emails.</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setV(initial)}
              disabled={saving}
              className="rounded-[9px] px-3.5 py-2 text-[13.5px] text-site-dark-muted hover:text-nav-strong"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={cn("rounded-[9px] bg-nav-electric px-3.5 py-2 text-[13.5px] font-semibold text-report-verdict transition-opacity hover:opacity-90", saving && "opacity-60")}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Mark({ values, size }: { values: Values; size: number }) {
  return values.logo_url ? (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-ink-200 bg-white" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={values.logo_url} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
    </span>
  ) : (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[7px] text-xs font-bold text-white"
      style={{ width: size, height: size, background: values.brand_color }}
    >
      {(values.name || "A").charAt(0).toUpperCase()}
    </span>
  );
}

function BrandingPreview({ values }: { values: Values }) {
  return (
    // The report is always on white paper, whatever the app theme.
    <div className="theme-light overflow-hidden rounded-card border border-ink-200 bg-white text-[#12171C]">
      <div className="h-[5px]" style={{ background: values.brand_color }} />
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Mark values={values} size={26} />
          <span className="truncate text-[13px] font-semibold">{values.name || "Your Agency"}</span>
        </div>
        <p className="mt-3.5 text-base font-semibold tracking-[-0.02em]">Monthly Performance Report</p>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {[
            { l: "Clicks", v: "1,284" },
            { l: "Impressions", v: "48.2k" },
          ].map((m) => (
            <div key={m.l} className="rounded-lg bg-[#F6F5F2] p-2">
              <p className="text-[10.5px] text-[#6A7078]">{m.l}</p>
              <p className="text-[15px] font-semibold" style={{ color: values.brand_color }}>{m.v}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-[#EFEDE9] pt-2 text-[10.5px] text-[#6A7078]">
          {values.footer_text || `Prepared by ${values.name || "Your Agency"}`}
        </p>
      </div>
    </div>
  );
}

function EmailPreviewCard({ values, email }: { values: Values; email?: EmailPreview }) {
  const from = email?.senderName || values.name || "Your Agency";
  return (
    <div className="theme-light rounded-card border border-ink-200 bg-white p-3.5 text-[#12171C]">
      <p className="truncate text-xs text-[#6A7078]">
        From <strong className="font-semibold text-[#12171C]">{from}</strong>
        {email?.senderEmail ? ` <${email.senderEmail}>` : ""}
      </p>
      <p className="mt-1.5 text-[13.5px] font-semibold">Your performance report is ready</p>
      <span className="mt-2.5 inline-flex rounded-lg px-3 py-[7px] text-[12.5px] font-semibold text-white" style={{ background: values.brand_color }}>
        View report
      </span>
    </div>
  );
}

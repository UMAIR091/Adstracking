"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveAffiliateAction } from "./actions";
import type { AffiliateInput } from "@/lib/affiliates/validate";

type Initial = Partial<{
  code: string;
  name: string;
  email: string;
  notes: string | null;
  status: "active" | "paused";
  commission_pct: number;
  commission_type: "first_payment" | "recurring";
  recurring_months: number | null;
  discount_code: string | null;
  payout_method: string | null;
  payout_details: string | null;
}>;

// Create or edit an affiliate. Validation runs again on the server
// (lib/affiliates/validate.ts); the browser checks are only a convenience.
export function AffiliateForm({ id, initial, onDone }: { id?: string; initial?: Initial; onDone?: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AffiliateInput>({
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    notes: initial?.notes ?? "",
    status: initial?.status ?? "active",
    commissionPct: initial?.commission_pct ?? "",
    commissionType: initial?.commission_type ?? "recurring",
    recurringMonths: initial?.recurring_months ?? "",
    discountCode: initial?.discount_code ?? "",
    payoutMethod: initial?.payout_method ?? "",
    payoutDetails: initial?.payout_details ?? "",
  });
  const set = <K extends keyof AffiliateInput>(key: K, value: AffiliateInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await saveAffiliateAction(id ?? null, form);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(id ? "Affiliate saved." : "Affiliate created.");
    if (!id && res.id) router.push(`/dashboard/admin/affiliates/${res.id}`);
    else router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="aff-code">Code</Label>
        <Input id="aff-code" value={form.code} onChange={(e) => set("code", e.target.value.toLowerCase())} placeholder="creatorname" required pattern="[a-z0-9][a-z0-9_\-]{1,31}" />
        <p className="mt-1 text-xs text-ink-500">Used in the link: ?ref={form.code || "code"}</p>
      </div>
      <div>
        <Label htmlFor="aff-name">Name</Label>
        <Input id="aff-name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="aff-email">Email</Label>
        <Input id="aff-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
        <p className="mt-1 text-xs text-ink-500">A signup with this email is never attributed to them.</p>
      </div>
      <div>
        <Label htmlFor="aff-status">Status</Label>
        <select id="aff-status" className="field h-9 w-full" value={form.status} onChange={(e) => set("status", e.target.value as AffiliateInput["status"])}>
          <option value="active">Active</option>
          <option value="paused">Paused (new signups not attributed)</option>
        </select>
      </div>
      <div>
        <Label htmlFor="aff-pct">Commission rate (%)</Label>
        <Input id="aff-pct" inputMode="decimal" value={String(form.commissionPct)} onChange={(e) => set("commissionPct", e.target.value)} placeholder="e.g. 20" required />
      </div>
      <div>
        <Label htmlFor="aff-type">Commission type</Label>
        <select id="aff-type" className="field h-9 w-full" value={form.commissionType} onChange={(e) => set("commissionType", e.target.value as AffiliateInput["commissionType"])}>
          <option value="recurring">Recurring</option>
          <option value="first_payment">First payment only</option>
        </select>
      </div>
      {form.commissionType === "recurring" && (
        <div>
          <Label htmlFor="aff-months">Recurring months</Label>
          <Input id="aff-months" inputMode="numeric" value={String(form.recurringMonths ?? "")} onChange={(e) => set("recurringMonths", e.target.value)} placeholder="Blank = for the life of the subscription" />
        </div>
      )}
      <div>
        <Label htmlFor="aff-discount">Paddle discount code (reference only)</Label>
        <Input id="aff-discount" value={form.discountCode ?? ""} onChange={(e) => set("discountCode", e.target.value)} />
      </div>
      <div>
        <Label htmlFor="aff-method">Payout method</Label>
        <Input id="aff-method" value={form.payoutMethod ?? ""} onChange={(e) => set("payoutMethod", e.target.value)} placeholder="Payoneer, PayPal, Wise…" />
      </div>
      <div>
        <Label htmlFor="aff-details">Payout details</Label>
        <Input id="aff-details" value={form.payoutDetails ?? ""} onChange={(e) => set("payoutDetails", e.target.value)} placeholder="Account email or handle" autoComplete="off" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="aff-notes">Notes</Label>
        <Textarea id="aff-notes" rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : id ? "Save changes" : "Create affiliate"}</Button>
      </div>
    </form>
  );
}

"use server";

// Server actions for the owner's affiliate pages. Each one repeats the
// platform-admin check (lib/admin.ts) — a page being hidden is not access
// control — and writes with the service role, the only role with grants on
// the affiliate tables (migration 0043).
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAffiliate, type AffiliateInput } from "@/lib/affiliates/validate";

export type ActionResult = { ok: true; id?: string; count?: number } | { ok: false; error: string };

const NOT_FOUND = "Not found.";

export async function saveAffiliateAction(id: string | null, input: AffiliateInput): Promise<ActionResult> {
  if (!(await requirePlatformAdmin())) return { ok: false, error: NOT_FOUND };
  const checked = validateAffiliate(input);
  if (!checked.ok) return checked;

  const admin = createAdminClient();
  const write = id
    ? admin.from("affiliates").update({ ...checked.row, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle()
    : admin.from("affiliates").insert(checked.row).select("id").single();
  const { data, error } = await write;
  if (error) {
    // 23505: unique violation — the only unique column a form can collide on is code.
    if (error.code === "23505") return { ok: false, error: `The code "${checked.row.code}" is already taken.` };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: NOT_FOUND };

  revalidatePath("/dashboard/admin/affiliates");
  return { ok: true, id: data.id as string };
}

export async function setAffiliateStatusAction(id: string, status: "active" | "paused"): Promise<ActionResult> {
  if (!(await requirePlatformAdmin())) return { ok: false, error: NOT_FOUND };
  if (status !== "active" && status !== "paused") return { ok: false, error: "Invalid status." };
  const { error } = await createAdminClient()
    .from("affiliates")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/admin/affiliates");
  return { ok: true };
}

/**
 * Marks payable commissions as paid. Only rows whose hold has passed and that
 * are not already paid or reversed can change — re-checked in the update
 * itself, so a stale page can't mark a pending or reversed row.
 */
export async function markCommissionsPaidAction(affiliateId: string, ids: string[], payoutReference: string): Promise<ActionResult> {
  if (!(await requirePlatformAdmin())) return { ok: false, error: NOT_FOUND };
  const reference = (payoutReference ?? "").trim().slice(0, 200);
  if (!reference) return { ok: false, error: "Enter the payout reference (e.g. the Payoneer or PayPal transaction id)." };
  const selected = Array.from(new Set((ids ?? []).filter((x) => typeof x === "string" && x))).slice(0, 500);
  if (!selected.length) return { ok: false, error: "Select at least one payable commission." };

  const now = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from("affiliate_commissions")
    .update({ status: "paid", paid_at: now, payout_reference: reference })
    .eq("affiliate_id", affiliateId)
    .in("id", selected)
    .in("status", ["pending", "payable"])
    .lte("payable_after", now)
    .select("id");
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dashboard/admin/affiliates/${affiliateId}`);
  revalidatePath("/dashboard/admin/affiliates");
  return { ok: true, count: data?.length ?? 0 };
}

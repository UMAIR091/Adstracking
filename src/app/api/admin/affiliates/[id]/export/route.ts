import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { csvCell } from "@/lib/affiliates/validate";
import { effectiveStatus, type CommissionStatus } from "@/lib/affiliates/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CSV of an affiliate's PAYABLE commissions (hold passed, not paid, not
// reversed), for the owner's manual payout. ?month=YYYY-MM narrows it to
// commissions created that month (UTC). Platform admins only; anyone else
// gets a 404. Payout details are deliberately left out of the file — they are
// shown on the admin page only.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await requirePlatformAdmin())) return new NextResponse("Not found", { status: 404 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) return new NextResponse("Not found", { status: 404 });

  const month = new URL(req.url).searchParams.get("month");
  const range = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? { from: `${month}-01T00:00:00Z`, to: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString() }
    : null;

  const admin = createAdminClient();
  const { data: affiliate } = await admin.from("affiliates").select("id, code, name, email, payout_method").eq("id", params.id).maybeSingle();
  if (!affiliate) return new NextResponse("Not found", { status: 404 });

  let query = admin
    .from("affiliate_commissions")
    .select("id, agency_id, paddle_transaction_id, currency, net_amount_minor, commission_pct, commission_amount_minor, status, payable_after, created_at, clawback_needed")
    .eq("affiliate_id", params.id)
    .in("status", ["pending", "payable"])
    .order("created_at", { ascending: true });
  if (range) query = query.gte("created_at", range.from).lt("created_at", range.to);
  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const payable = (rows ?? []).filter((r) => effectiveStatus(r.status as CommissionStatus, r.payable_after as string, now) === "payable");
  const agencyIds = Array.from(new Set(payable.map((r) => r.agency_id as string)));
  const { data: agencies } = agencyIds.length ? await admin.from("agencies").select("id, name").in("id", agencyIds) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((agencies ?? []).map((a) => [a.id as string, a.name as string]));

  const major = (minor: number, currency: string) => (["JPY", "KRW"].includes(currency.toUpperCase()) ? String(minor) : (minor / 100).toFixed(2));
  const header = ["affiliate_code", "affiliate_name", "affiliate_email", "payout_method", "commission_id", "created_at", "payable_after", "agency", "paddle_transaction_id", "currency", "net_amount", "commission_pct", "commission_amount", "clawback_needed"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of payable) {
    lines.push(
      [
        affiliate.code, affiliate.name, affiliate.email, affiliate.payout_method ?? "",
        r.id, r.created_at, r.payable_after, nameOf.get(r.agency_id as string) ?? "", r.paddle_transaction_id,
        r.currency, major(Number(r.net_amount_minor), r.currency as string), Number(r.commission_pct).toFixed(2),
        major(Number(r.commission_amount_minor), r.currency as string), r.clawback_needed ? "yes" : "no",
      ].map(csvCell).join(",")
    );
  }

  const filename = `affiliate-${affiliate.code}-payable${month && range ? `-${month}` : ""}.csv`;
  return new NextResponse(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

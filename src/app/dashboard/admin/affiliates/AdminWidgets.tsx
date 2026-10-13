"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMinor } from "@/lib/affiliates/rules";
import { markCommissionsPaidAction, setAffiliateStatusAction } from "./actions";

export function CopyLink({ url }: { url: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-800">{url}</code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success("Link copied.");
          } catch {
            toast.error("Couldn't copy — select the link and copy it by hand.");
          }
        }}
      >
        <Copy size={14} /> Copy
      </Button>
    </div>
  );
}

export function StatusToggle({ id, status }: { id: string; status: "active" | "paused" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = status === "active" ? "paused" : "active";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await setAffiliateStatusAction(id, next);
        setBusy(false);
        if (!res.ok) return toast.error(res.error);
        toast.success(next === "paused" ? "Affiliate paused." : "Affiliate active again.");
        router.refresh();
      }}
    >
      {status === "active" ? "Pause" : "Activate"}
    </Button>
  );
}

export type CommissionView = {
  id: string;
  agencyName: string;
  createdAt: string;
  payableAfter: string;
  currency: string;
  netMinor: number;
  pct: number;
  amountMinor: number;
  status: "pending" | "payable" | "paid" | "reversed";
  paidAt: string | null;
  payoutReference: string | null;
  clawbackNeeded: boolean;
  note: string | null;
};

const STATUS_STYLE: Record<CommissionView["status"], string> = {
  pending: "bg-ink-100 text-ink-600",
  payable: "bg-success-50 text-success-700",
  paid: "bg-info-50 text-info-700",
  reversed: "bg-danger-50 text-danger-700",
};

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

// Commission rows, with payable ones selectable for "mark paid".
export function CommissionTable({ affiliateId, rows }: { affiliateId: string; rows: CommissionView[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const payable = useMemo(() => rows.filter((r) => r.status === "payable"), [rows]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function markPaid() {
    setBusy(true);
    const res = await markCommissionsPaidAction(affiliateId, Array.from(selected), reference);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${res.count ?? 0} commission${res.count === 1 ? "" : "s"} marked paid.`);
    setSelected(new Set());
    setReference("");
    router.refresh();
  }

  if (!rows.length) return <p className="text-sm text-ink-500">No commissions yet.</p>;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-ink-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all payable"
                  disabled={!payable.length}
                  checked={payable.length > 0 && payable.every((r) => selected.has(r.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(payable.map((r) => r.id)) : new Set())}
                />
              </th>
              <th className="px-3 py-2">Agency</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Payable from</th>
              <th className="px-3 py-2 text-right">Net</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">Commission</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.clawbackNeeded ? "bg-danger-50/40" : undefined}>
                <td className="px-3 py-2">
                  <input type="checkbox" aria-label={`Select commission for ${r.agencyName}`} disabled={r.status !== "payable"} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td className="px-3 py-2 text-ink-800">
                  {r.agencyName}
                  {r.clawbackNeeded && (
                    <span className="mt-1 flex items-center gap-1 text-xs font-medium text-danger-700">
                      <AlertTriangle size={12} /> Refunded after payout — recover it
                    </span>
                  )}
                  {r.note && <span className="mt-1 block text-xs text-ink-500">{r.note}</span>}
                </td>
                <td className="px-3 py-2 text-ink-600">{day(r.createdAt)}</td>
                <td className="px-3 py-2 text-ink-600">{day(r.payableAfter)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-700">{formatMinor(r.netMinor, r.currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-700">{r.pct}%</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums text-ink-900">{formatMinor(r.amountMinor, r.currency)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  {r.status === "paid" && <span className="mt-1 block text-xs text-ink-500">{day(r.paidAt)} · {r.payoutReference}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="payout-ref">Payout reference</Label>
          <Input id="payout-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Payoneer transfer id" />
        </div>
        <Button type="button" disabled={busy || selected.size === 0} onClick={markPaid}>
          {busy ? "Saving…" : `Mark ${selected.size || ""} paid`.replace("  ", " ")}
        </Button>
      </div>
    </div>
  );
}

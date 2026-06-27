"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileBarChart2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const TEMPLATES = [
  { key: "seo", name: "SEO Report" },
  { key: "marketing", name: "Marketing Performance" },
  { key: "executive", name: "Executive Summary" },
];

export function GenerateReport({ clientId, ready }: { clientId: string; ready: boolean }) {
  const router = useRouter();
  const [template, setTemplate] = useState("seo");
  const [period, setPeriod] = useState(28);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    const res = await fetch("/api/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, templateKey: template, periodDays: period }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      return toast.error(data.error ?? "Failed to generate report");
    }
    toast.success("Report generated");
    router.push(`/dashboard/reports/${data.id}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileBarChart2 size={16} className="text-brand-500" /> Generate a report</CardTitle>
        <CardDescription>Build a branded, shareable report from your latest synced Search Console data — with an AI-written executive summary.</CardDescription>
      </CardHeader>
      <CardContent>
        {!ready ? (
          <p className="text-sm text-ink-500">Connect a Search Console property above to generate reports.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Template</label>
              <select value={template} onChange={(e) => setTemplate(e.target.value)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-700">Date range</label>
              <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} className="h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                <option value={28}>Last 28 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
            <Button onClick={generate} disabled={busy}>
              {busy ? "Generating…" : "Generate report"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

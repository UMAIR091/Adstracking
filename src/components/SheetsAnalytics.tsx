"use client";

// Google Sheets data block — renders the synced worksheet as a table so
// custom client data (offline conversions, budgets, KPIs) lives alongside
// the platform metrics.
import { FileSpreadsheet, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SheetTable } from "@/lib/integrations/metrics";

const SHOW_ROWS = 12;

export function SheetsAnalytics({ report }: { report: SheetTable }) {
  const { headers, rows } = report;
  if (headers.length === 0 && rows.length === 0) {
    return <p className="text-sm text-ink-400">The connected sheet is empty.</p>;
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <FileSpreadsheet size={15} className="text-emerald-600" /> {report.title}
            <span className="font-normal text-ink-400">· {report.sheetTitle}</span>
          </span>
          {report.url && (
            <a href={report.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
              Open sheet <ExternalLink size={12} />
            </a>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400">
                {headers.map((h, i) => (
                  <th key={`${h}-${i}`} className="whitespace-nowrap pb-2 pr-4 font-medium">{h || "—"}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, SHOW_ROWS).map((r, ri) => (
                <tr key={ri} className="border-t border-slate-100">
                  {r.map((cell, ci) => (
                    <td key={ci} className="max-w-[16rem] truncate py-2 pr-4 text-ink-700" title={cell}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.totalRows > SHOW_ROWS && (
          <p className="mt-2 text-xs text-ink-400">Showing {SHOW_ROWS} of {report.totalRows} rows — the full table is available to reports.</p>
        )}
      </CardContent>
    </Card>
  );
}

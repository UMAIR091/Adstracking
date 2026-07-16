"use client";

// Renders a BigQueryReport: either one selected table's metadata + schema +
// read-only row preview, or (when no table is chosen yet) a project overview of
// datasets and tables. Read-only — this only displays cached snapshot data.
import { Database, Table2, Clock, Rows3, HardDrive, Code2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BigQueryReport } from "@/lib/integrations/metrics";

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

function fmtBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Rows3 }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="flex items-center gap-1.5 text-xs text-ink-500">
        <Icon size={13} className="text-ink-400" /> {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-ink-900">{value}</p>
    </div>
  );
}

export function BigQueryAnalytics({ report }: { report: BigQueryReport }) {
  const path = [report.projectId, report.datasetId, report.tableId].filter(Boolean).join(".");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-ink-500">
          <Database size={15} className="text-ink-400" />
          <span className="font-medium text-ink-700">{path || report.projectId}</span>
          {report.tableType && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-ink-500">{report.tableType.toLowerCase()}</span>}
        </p>
        <a href={report.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
          Open in BigQuery <ExternalLink size={12} />
        </a>
      </div>

      {/* Overview mode: no table selected yet. */}
      {report.overview ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Table2 size={15} className="text-ink-400" /> Datasets &amp; tables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-400">
                    {report.headers.map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {row.map((cell, j) => <td key={j} className="py-2 pr-3 text-ink-700">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-400">Select a dataset and table on the connection above to sync its schema and a read-only row preview.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Rows" value={report.numRows != null ? fmtNum(report.numRows) : "—"} icon={Rows3} />
            <Stat label="Size" value={report.sizeBytes != null ? fmtBytes(report.sizeBytes) : "—"} icon={HardDrive} />
            <Stat label="Columns" value={fmtNum(report.schema.length)} icon={Table2} />
            <Stat label="Last modified" value={report.lastModified ? new Date(report.lastModified).toLocaleDateString() : "—"} icon={Clock} />
          </div>

          {report.schema.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><Table2 size={15} className="text-ink-400" /> Schema</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-ink-400">
                        <th className="pb-2 pr-3 font-medium">Column</th>
                        <th className="pb-2 pr-3 font-medium">Type</th>
                        <th className="pb-2 font-medium">Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.schema.map((f) => (
                        <tr key={f.name} className="border-t border-slate-100">
                          <td className="py-2 pr-3 font-medium text-ink-800">{f.name}</td>
                          <td className="py-2 pr-3 text-ink-600">{f.type}</td>
                          <td className="py-2 text-ink-500">{f.mode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {report.rows.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Rows3 size={15} className="text-ink-400" /> Preview
                  <span className="text-xs font-normal text-ink-400">(first {report.rows.length} rows)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-ink-400">
                        {report.headers.map((h, i) => <th key={`${h}-${i}`} className="whitespace-nowrap pb-2 pr-3 font-medium">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          {row.map((cell, j) => (
                            <td key={j} className="max-w-xs truncate py-2 pr-3 text-ink-700" title={cell}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {report.querySql && (
                  <p className="mt-3 flex items-center gap-1.5 font-mono text-xs text-ink-400">
                    <Code2 size={12} /> {report.querySql}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

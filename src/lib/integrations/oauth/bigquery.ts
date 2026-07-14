// Google BigQuery backend. Reuses the shared Google OAuth app (bigquery.readonly
// scope). BigQuery is a warehouse, not a metrics source, so the snapshot is a
// bounded overview of the selected project's datasets and tables rendered as a
// SheetTable (the same custom-data shape Google Sheets fills), shown on the
// dashboard and embeddable in reports.
import type { IntegrationAccount } from "../types";
import { withRetry, type SheetTable } from "../metrics";

const API = "https://bigquery.googleapis.com/bigquery/v2";
const MAX_DATASETS = 25;
const MAX_ROWS = 200;

async function bqGet<T>(accessToken: string, path: string): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429) throw new Error("BigQuery rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { error?: { message?: string } }).error?.message ?? res.statusText;
      throw new Error(`BigQuery API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

// Lists the BigQuery projects the authenticated user can access.
export async function listBigQueryProjects(accessToken: string): Promise<IntegrationAccount[]> {
  const data = await bqGet<{ projects?: { id: string; friendlyName?: string }[] }>(accessToken, "/projects?maxResults=200");
  return (data.projects ?? []).map((p) => ({ id: p.id, name: p.friendlyName || p.id }));
}

type Dataset = { datasetReference?: { datasetId?: string } };
type Table = { tableReference?: { tableId?: string }; type?: string };

// Snapshots the project's datasets and tables as a bounded table. periodDays
// doesn't apply — the latest warehouse structure is what reports embed.
export async function fetchBigQuerySnapshot(accessToken: string, projectId: string): Promise<SheetTable> {
  const ds = await bqGet<{ datasets?: Dataset[] }>(accessToken, `/projects/${encodeURIComponent(projectId)}/datasets?maxResults=${MAX_DATASETS}`);
  const datasets = (ds.datasets ?? []).map((d) => d.datasetReference?.datasetId).filter((v): v is string => Boolean(v));

  const rows: string[][] = [];
  for (const datasetId of datasets) {
    try {
      const t = await bqGet<{ tables?: Table[] }>(
        accessToken, `/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables?maxResults=100`
      );
      const tables = t.tables ?? [];
      if (tables.length === 0) {
        rows.push([datasetId, "—", "empty"]);
      } else {
        for (const tbl of tables) rows.push([datasetId, tbl.tableReference?.tableId ?? "—", (tbl.type ?? "TABLE").toLowerCase()]);
      }
    } catch {
      rows.push([datasetId, "—", "no access"]);
    }
    if (rows.length >= MAX_ROWS) break;
  }

  return {
    platform: "bigquery",
    title: projectId,
    sheetTitle: "Datasets & tables",
    url: `https://console.cloud.google.com/bigquery?project=${encodeURIComponent(projectId)}`,
    headers: ["Dataset", "Table", "Type"],
    rows: rows.slice(0, MAX_ROWS),
    totalRows: rows.length,
  };
}

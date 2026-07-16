// Google BigQuery backend. Reuses the shared Google OAuth app (bigquery.readonly
// scope) — no separate OAuth implementation. BigQuery is a warehouse rather than
// a metrics source, so a connection selects one project → dataset → table and the
// snapshot is that table's metadata, schema and a bounded, READ-ONLY preview of
// its rows (normalized into BigQueryReport, rendered by BigQueryAnalytics).
//
// Every call here is read-only: list endpoints, tables.get (metadata) and either
// a read-only SELECT via jobs.query or tabledata.list. No write/DML/DDL is ever
// issued, honoring the bigquery.readonly grant.
import type { IntegrationAccount, IntegrationConfig } from "../types";
import { withRetry, type BigQueryReport, type BigQuerySchemaField } from "../metrics";

const API = "https://bigquery.googleapis.com/bigquery/v2";
const MAX_DATASETS = 50;
const MAX_TABLES = 200;
const PREVIEW_ROWS = 50;
// Cap the bytes a preview query may bill so a SELECT against a huge table can
// never run up a surprise cost — the query fails fast and we fall back to the
// (free, no-scan) tabledata.list preview instead.
const MAX_BYTES_BILLED = String(2 * 1024 * 1024 * 1024); // 2 GiB

async function bqGet<T>(accessToken: string, path: string): Promise<T> {
  return bqRequest<T>(accessToken, path, "GET");
}

async function bqRequest<T>(accessToken: string, path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 429) throw new Error("BigQuery rate limit (429)");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { error?: { message?: string } }).error?.message ?? res.statusText;
      throw new Error(`BigQuery API error: ${detail} (${res.status})`);
    }
    return data as T;
  });
}

// ── Discovery ────────────────────────────────────────────────

// Lists the BigQuery projects the authenticated user can access. Also the basis
// for connect-time validation (see verifyBigQueryAccess).
export async function listBigQueryProjects(accessToken: string): Promise<IntegrationAccount[]> {
  const data = await bqGet<{ projects?: { id: string; friendlyName?: string }[] }>(accessToken, "/projects?maxResults=200");
  return (data.projects ?? []).map((p) => ({ id: p.id, name: p.friendlyName || p.id }));
}

type Dataset = { datasetReference?: { datasetId?: string; projectId?: string }; friendlyName?: string };

// Lists datasets in one project.
export async function listBigQueryDatasets(accessToken: string, projectId: string): Promise<IntegrationAccount[]> {
  const data = await bqGet<{ datasets?: Dataset[] }>(
    accessToken, `/projects/${encodeURIComponent(projectId)}/datasets?maxResults=${MAX_DATASETS}&all=false`
  );
  return (data.datasets ?? [])
    .map((d) => d.datasetReference?.datasetId)
    .filter((v): v is string => Boolean(v))
    .map((id) => ({ id, name: id }));
}

type TableListItem = { tableReference?: { tableId?: string }; type?: string };

// Lists tables and views in one dataset. `type` is carried in the name suffix so
// the selector can show "(view)" without a second call.
export async function listBigQueryTables(accessToken: string, projectId: string, datasetId: string): Promise<IntegrationAccount[]> {
  const data = await bqGet<{ tables?: TableListItem[] }>(
    accessToken,
    `/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables?maxResults=${MAX_TABLES}`
  );
  return (data.tables ?? [])
    .map((t) => {
      const id = t.tableReference?.tableId;
      if (!id) return null;
      const kind = (t.type ?? "TABLE").toUpperCase();
      const name = kind === "TABLE" ? id : `${id} (${kind.toLowerCase().replace("_", " ")})`;
      return { id, name };
    })
    .filter((v): v is IntegrationAccount => v !== null);
}

// Connect-time validation: confirms the OAuth token works against BigQuery and
// that the user has at least one accessible project. Returns the projects so the
// caller can report the count. Throws a provider-specific error otherwise.
export async function verifyBigQueryAccess(accessToken: string): Promise<IntegrationAccount[]> {
  let projects: IntegrationAccount[];
  try {
    projects = await listBigQueryProjects(accessToken);
  } catch (err) {
    const msg = (err as Error).message;
    if (/\(403\)/.test(msg)) {
      throw new Error("BigQuery access is not enabled for this Google account, or the BigQuery API is disabled for the project.");
    }
    throw new Error(`Couldn't reach BigQuery: ${msg}`);
  }
  if (projects.length === 0) {
    throw new Error("This Google account can't access any BigQuery projects. Grant it BigQuery access (roles/bigquery.dataViewer + jobUser) and try again.");
  }
  return projects;
}

// ── Snapshot ─────────────────────────────────────────────────

type TableMeta = {
  type?: string;
  numRows?: string;
  numBytes?: string;
  lastModifiedTime?: string;
  schema?: { fields?: RawSchemaField[] };
};
type RawSchemaField = { name?: string; type?: string; mode?: string };

function flattenSchema(fields: RawSchemaField[] | undefined, prefix = ""): BigQuerySchemaField[] {
  const out: BigQuerySchemaField[] = [];
  for (const f of fields ?? []) {
    const name = prefix ? `${prefix}.${f.name ?? "?"}` : (f.name ?? "?");
    out.push({ name, type: (f.type ?? "STRING").toUpperCase(), mode: (f.mode ?? "NULLABLE").toUpperCase() });
  }
  return out;
}

async function getTableMeta(accessToken: string, projectId: string, datasetId: string, tableId: string): Promise<TableMeta> {
  return bqGet<TableMeta>(
    accessToken,
    `/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables/${encodeURIComponent(tableId)}`
  );
}

type QueryResponse = {
  schema?: { fields?: RawSchemaField[] };
  rows?: { f?: { v?: unknown }[] }[];
  totalRows?: string;
  jobComplete?: boolean;
};

// A BigQuery cell value can be a scalar, null, or a nested record/array. Render
// it as a compact string for the preview table.
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function rowsFromCells(rows: QueryResponse["rows"], width: number): string[][] {
  return (rows ?? []).map((r) => {
    const cells = r.f ?? [];
    return Array.from({ length: width }, (_, i) => cellToString(cells[i]?.v));
  });
}

// Runs a read-only SELECT preview via jobs.query. SELECT-only with a hard
// maximumBytesBilled cap — never writes, and can't run up cost. Returns null so
// the caller can fall back to tabledata.list if the query can't run (e.g. the
// grant lacks jobs.create, or the scan would exceed the byte cap).
async function readOnlyQueryPreview(
  accessToken: string, projectId: string, datasetId: string, tableId: string
): Promise<{ headers: string[]; rows: string[][]; totalRows: number; sql: string } | null> {
  const sql = `SELECT * FROM \`${projectId}.${datasetId}.${tableId}\` LIMIT ${PREVIEW_ROWS}`;
  try {
    const res = await bqRequest<QueryResponse>(accessToken, `/projects/${encodeURIComponent(projectId)}/queries`, "POST", {
      query: sql,
      useLegacySql: false,
      maxResults: PREVIEW_ROWS,
      maximumBytesBilled: MAX_BYTES_BILLED,
      timeoutMs: 30000,
    });
    const headers = flattenSchema(res.schema?.fields).map((f) => f.name);
    return { headers, rows: rowsFromCells(res.rows, headers.length), totalRows: Number(res.totalRows ?? 0), sql };
  } catch {
    return null;
  }
}

// Free, no-scan preview straight from table storage — the fallback when a query
// job can't run. Uses the schema (from metadata) for column headers.
async function tabledataPreview(
  accessToken: string, projectId: string, datasetId: string, tableId: string, schema: BigQuerySchemaField[]
): Promise<{ headers: string[]; rows: string[][]; totalRows: number }> {
  const headers = schema.map((f) => f.name);
  const data = await bqGet<{ rows?: QueryResponse["rows"]; totalRows?: string }>(
    accessToken,
    `/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables/${encodeURIComponent(tableId)}/data?maxResults=${PREVIEW_ROWS}`
  );
  return { headers, rows: rowsFromCells(data.rows, headers.length), totalRows: Number(data.totalRows ?? 0) };
}

const consoleUrl = (projectId: string, datasetId?: string | null, tableId?: string | null) => {
  const base = `https://console.cloud.google.com/bigquery?project=${encodeURIComponent(projectId)}`;
  if (datasetId && tableId) return `${base}&ws=!1m5!1m4!4m3!1s${encodeURIComponent(projectId)}!2s${encodeURIComponent(datasetId)}!3s${encodeURIComponent(tableId)}`;
  return base;
};

const cfgStr = (config: IntegrationConfig | undefined, key: string): string | null => {
  const v = config?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
};

// A project/dataset overview used when no specific table is selected yet — lists
// the datasets and their tables so the connection still shows the warehouse shape.
async function buildOverview(accessToken: string, projectId: string): Promise<BigQueryReport> {
  const datasets = await listBigQueryDatasets(accessToken, projectId);
  const overview: { dataset: string; table: string; type: string }[] = [];
  for (const d of datasets.slice(0, MAX_DATASETS)) {
    try {
      const tables = await listBigQueryTables(accessToken, projectId, d.id);
      if (tables.length === 0) overview.push({ dataset: d.id, table: "—", type: "empty" });
      else for (const t of tables) overview.push({ dataset: d.id, table: t.id, type: "table" });
    } catch {
      overview.push({ dataset: d.id, table: "—", type: "no access" });
    }
    if (overview.length >= MAX_TABLES) break;
  }
  return {
    platform: "bigquery",
    projectId,
    datasetId: null,
    tableId: null,
    tableType: null,
    numRows: null,
    sizeBytes: null,
    lastModified: null,
    schema: [],
    headers: ["Dataset", "Table", "Type"],
    rows: overview.map((o) => [o.dataset, o.table, o.type]),
    totalRows: overview.length,
    querySql: null,
    url: consoleUrl(projectId),
    overview,
  };
}

// Builds the snapshot for a connection. `accountId` is the selected project;
// `config.dataset_id` / `config.table_id` (when present) select the table to
// detail. periodDays doesn't apply — the current table state is what reports embed.
export async function fetchBigQuerySnapshot(
  accessToken: string, projectId: string, config?: IntegrationConfig
): Promise<BigQueryReport> {
  const datasetId = cfgStr(config, "dataset_id");
  const tableId = cfgStr(config, "table_id");

  // No table chosen yet → project overview.
  if (!datasetId || !tableId) return buildOverview(accessToken, projectId);

  const meta = await getTableMeta(accessToken, projectId, datasetId, tableId);
  const schema = flattenSchema(meta.schema?.fields);

  // Prefer a real read-only SQL query; fall back to a free tabledata read.
  const queried = await readOnlyQueryPreview(accessToken, projectId, datasetId, tableId);
  const preview = queried ?? { ...(await tabledataPreview(accessToken, projectId, datasetId, tableId, schema)), sql: null as string | null };

  return {
    platform: "bigquery",
    projectId,
    datasetId,
    tableId,
    tableType: (meta.type ?? "TABLE").toUpperCase(),
    numRows: meta.numRows != null ? Number(meta.numRows) : null,
    sizeBytes: meta.numBytes != null ? Number(meta.numBytes) : null,
    lastModified: meta.lastModifiedTime ? new Date(Number(meta.lastModifiedTime)).toISOString() : null,
    schema,
    headers: preview.headers,
    rows: preview.rows,
    totalRows: preview.totalRows,
    querySql: preview.sql,
    url: consoleUrl(projectId, datasetId, tableId),
    overview: null,
  };
}

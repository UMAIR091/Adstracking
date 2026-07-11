// Google Sheets backend. Reuses the shared Google OAuth app with read-only
// Sheets + Drive-metadata scopes. Sheets is a custom-data source: the snapshot
// is the first worksheet as a bounded table (SheetTable), shown on the client
// dashboard and available to reports — not force-fitted into ad metrics.
import type { IntegrationAccount } from "../types";
import { withRetry, type SheetTable } from "../metrics";

const DRIVE = "https://www.googleapis.com/drive/v3";
const SHEETS = "https://sheets.googleapis.com/v4";

const MAX_ROWS = 200;
const MAX_COLS = 26; // A..Z

async function gGet<T>(url: string, accessToken: string): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { error?: { message?: string } }).error?.message ?? `${res.status} ${res.statusText}`;
      throw new Error(`Google Sheets API error: ${detail}`);
    }
    return data as T;
  });
}

// Lists the user's spreadsheets (most recently modified first).
export async function listSpreadsheets(accessToken: string): Promise<IntegrationAccount[]> {
  const params = new URLSearchParams({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    orderBy: "modifiedTime desc",
    pageSize: "100",
    fields: "files(id,name)",
  });
  const data = await gGet<{ files?: { id: string; name: string }[] }>(
    `${DRIVE}/files?${params.toString()}`, accessToken
  );
  return (data.files ?? []).map((f) => ({ id: f.id, name: f.name }));
}

// Snapshots the first worksheet of the selected spreadsheet as a bounded
// table. periodDays doesn't apply to custom tabular data — the latest content
// is what reports embed.
export async function fetchSheetTable(accessToken: string, spreadsheetId: string): Promise<SheetTable> {
  const meta = await gGet<{
    properties?: { title?: string };
    spreadsheetUrl?: string;
    sheets?: { properties?: { title?: string } }[];
  }>(`${SHEETS}/spreadsheets/${spreadsheetId}?fields=properties.title,spreadsheetUrl,sheets.properties.title`, accessToken);

  const sheetTitle = meta.sheets?.[0]?.properties?.title ?? "Sheet1";
  const range = `'${sheetTitle.replace(/'/g, "''")}'!A1:${String.fromCharCode(64 + MAX_COLS)}${MAX_ROWS + 1}`;
  const values = await gGet<{ values?: string[][] }>(
    `${SHEETS}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
    accessToken
  );

  const rows = values.values ?? [];
  const headers = (rows[0] ?? []).map((h) => String(h ?? ""));
  const body = rows.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? "")));

  return {
    platform: "sheets",
    title: meta.properties?.title ?? "Spreadsheet",
    sheetTitle,
    url: meta.spreadsheetUrl ?? null,
    headers,
    rows: body.slice(0, MAX_ROWS),
    totalRows: body.length,
  };
}

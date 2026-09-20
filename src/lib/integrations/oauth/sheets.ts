// Google Sheets backend. Reuses the shared Google OAuth app with the read-only
// Sheets scope alone: the agency pastes the sheet's link, so ReportFlow never
// asks for a Drive scope and can only read that one sheet. Sheets is a
// custom-data source: the snapshot is the first worksheet as a bounded table
// (SheetTable), shown on the client dashboard and available to reports — not
// force-fitted into ad metrics.
import type { IntegrationAccount } from "../types";
import { withRetry, type SheetTable } from "../metrics";

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

// Pulls the spreadsheet id out of what the agency pasted: a browser link, a
// link with a #gid or query string, or the bare id.
export function parseSpreadsheetId(input: string): string | null {
  const value = (input ?? "").trim();
  const fromLink = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(value);
  if (fromLink) return fromLink[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(value) ? value : null;
}

// The "account" for Sheets is the single sheet the agency pasted. Reading its
// title both names the connection and proves the signed-in Google user can
// open it — no Drive-wide scope, so nothing else in their Drive is readable.
export async function resolveSpreadsheet(accessToken: string, linkOrId: string): Promise<IntegrationAccount[]> {
  const id = parseSpreadsheetId(linkOrId);
  if (!id) {
    throw new Error("That doesn't look like a Google Sheets link. Open the sheet and copy the link from your browser's address bar.");
  }
  const meta = await gGet<{ properties?: { title?: string } }>(
    `${SHEETS}/spreadsheets/${id}?fields=properties.title`, accessToken
  );
  return [{ id, name: meta.properties?.title || "Untitled spreadsheet" }];
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

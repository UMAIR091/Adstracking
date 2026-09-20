// Sheets is connected by pasting the sheet's link, which is what lets it ask
// only for spreadsheets.readonly. Listing a user's spreadsheets would need
// drive.metadata.readonly — a restricted scope Google approves only after an
// annual third-party security assessment.
import { describe, it, expect, vi, afterEach } from "vitest";
import { parseSpreadsheetId, resolveSpreadsheet } from "./sheets";

const ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";

afterEach(() => vi.unstubAllGlobals());

describe("parseSpreadsheetId", () => {
  it("reads the id from every shape a person might paste", () => {
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toBe(ID);
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`)).toBe(ID);
    expect(parseSpreadsheetId(`  https://docs.google.com/spreadsheets/d/${ID}  `)).toBe(ID);
    expect(parseSpreadsheetId(ID)).toBe(ID);
  });

  it("rejects anything that isn't a sheet", () => {
    expect(parseSpreadsheetId("https://docs.google.com/document/d/" + ID)).toBeNull();
    expect(parseSpreadsheetId("my sales sheet")).toBeNull();
    expect(parseSpreadsheetId("")).toBeNull();
  });
});

describe("resolveSpreadsheet", () => {
  it("names the connection after the sheet, reading only that sheet", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ properties: { title: "Client KPIs" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveSpreadsheet("token", `https://docs.google.com/spreadsheets/d/${ID}/edit`)).resolves.toEqual([
      { id: ID, name: "Client KPIs" },
    ]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url.startsWith(`https://sheets.googleapis.com/v4/spreadsheets/${ID}`)).toBe(true);
    // Never the Drive API: that is the scope we are avoiding.
    expect(url).not.toContain("googleapis.com/drive");
  });

  it("explains what to paste instead of failing with an API error", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveSpreadsheet("token", "not a link")).rejects.toThrow(/Google Sheets link/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a sheet the connected account cannot open", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "The caller does not have permission" } }), { status: 403 })));
    await expect(resolveSpreadsheet("token", ID)).rejects.toThrow("The caller does not have permission");
  });
});

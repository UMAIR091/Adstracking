import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Launch audit B3 regression guard.
//
// AI insight generation inside createClientReport takes ~15s. A report-
// generating route with no `maxDuration` runs at Vercel's 10s default and is
// killed mid-call before the report is stored, so a configured AI never lands
// on the report. Every route that makes an AI call — via createClientReport,
// via runScheduledReports, or directly — must budget at least the AI call time.
//
// The list is the guard. regenerate-insights was omitted from it and was
// therefore the one AI route still on the 10s default, which meant
// "Regenerate insights" could not complete in production at all. Add any new
// AI-calling route here.
//
// Read the source rather than importing the route so this stays a pure static
// check with no Next/runtime or env dependencies.

const AI_BUDGET_SECONDS = 60;

const ROUTES = [
  "src/app/api/reports/generate/route.ts", // manual "Generate report" — the one B3 fixed
  "src/app/api/reports/[id]/send/route.ts", // "Send now" / test send
  "src/app/api/schedules/run/route.ts", // manual run-now for a schedule
  "src/app/api/cron/reports/route.ts", // scheduled delivery
  "src/app/api/reports/[id]/regenerate-insights/route.ts", // calls the model directly
];

function maxDurationOf(relPath: string): number | null {
  const src = readFileSync(path.join(process.cwd(), relPath), "utf8");
  const m = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

describe("report-generating routes budget enough time for the AI step (B3)", () => {
  it.each(ROUTES)("%s declares maxDuration >= %i", (relPath) => {
    const value = maxDurationOf(relPath);
    expect(value, `${relPath} must export a maxDuration`).not.toBeNull();
    expect(value as number).toBeGreaterThanOrEqual(AI_BUDGET_SECONDS);
  });
});

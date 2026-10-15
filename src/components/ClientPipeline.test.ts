import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/GenerateReportDialog", () => ({ NewReportButton: () => null }));

import { pipelineSteps, type PipelineInput } from "./ClientPipeline";
import { deliveryOf } from "./ReportsBrowser";

const base: PipelineInput = {
  base: "/dashboard/clients/c1",
  clientId: "c1",
  connected: ["Search Console", "GA4"],
  attention: 0,
  firstIssue: null,
  lastSyncedAt: "2026-10-15T06:00:00Z",
  hasData: true,
  reportCount: 3,
  latestReport: { id: "r1", title: "September Performance Report", created_at: "2026-10-01T08:00:00Z" },
  schedule: { frequency: "monthly", enabled: true, nextRunAt: "2026-11-01T08:00:00Z" },
};

const states = (p: PipelineInput) => pipelineSteps(p).map((s) => `${s.key}:${s.state}`);

describe("pipelineSteps", () => {
  it("is all green for a connected, synced, reported, scheduled client", () => {
    expect(states(base)).toEqual(["Connect:ok", "Sync:ok", "Report:ok", "Deliver:ok"]);
    expect(pipelineSteps(base)[3].value).toBe("Monthly");
  });

  it("flags a client with nothing connected and leaves the rest idle", () => {
    const p = { ...base, connected: [], lastSyncedAt: null, hasData: false, reportCount: 0, latestReport: null, schedule: null };
    expect(states(p)).toEqual(["Connect:warn", "Sync:idle", "Report:idle", "Deliver:idle"]);
  });

  it("names the broken source on the Sync step", () => {
    const p = { ...base, attention: 1, firstIssue: "GA4: Reconnect required" };
    const steps = pipelineSteps(p);
    expect(steps[0].state).toBe("warn");
    expect(steps[1]).toMatchObject({ state: "warn", value: "Blocked", fact: "GA4: Reconnect required" });
  });

  it("waits, rather than claiming up to date, before the first sync", () => {
    const p = { ...base, lastSyncedAt: null, hasData: false, latestReport: null, reportCount: 0 };
    expect(pipelineSteps(p)[1]).toMatchObject({ state: "idle", value: "Waiting" });
  });

  it("reads a switched-off schedule as paused", () => {
    expect(pipelineSteps({ ...base, schedule: { frequency: "weekly", enabled: false, nextRunAt: null } })[3]).toMatchObject({
      state: "idle",
      value: "Paused",
    });
  });
});

describe("deliveryOf", () => {
  it("lets any failure win, then any send", () => {
    expect(deliveryOf({ sentCount: 2, failedCount: 1 })).toBe("failed");
    expect(deliveryOf({ sentCount: 1, failedCount: 0 })).toBe("sent");
    expect(deliveryOf({})).toBe("unsent");
  });
});

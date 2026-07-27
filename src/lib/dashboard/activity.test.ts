import { describe, it, expect } from "vitest";
import { buildActivity, type ActivityInput } from "./activity";

const base: ActivityInput = { clients: [], sources: [], reports: [], emails: [] };

const email = (over: Partial<ActivityInput["emails"][number]> = {}) => ({
  report_id: "r1",
  to_email: "client@example.com",
  status: "sent",
  sent_at: "2026-07-27T10:00:00Z",
  ...over,
});

describe("buildActivity — delivery origin", () => {
  it("reports a scheduled send as scheduled_report_sent", () => {
    const [e] = buildActivity({ ...base, emails: [email({ source: "scheduled" })] });
    expect(e.kind).toBe("scheduled_report_sent");
  });

  it("reports a manual send as report_emailed", () => {
    const [e] = buildActivity({ ...base, emails: [email({ source: "manual" })] });
    expect(e.kind).toBe("report_emailed");
  });

  // Rows written before migration 0031 have no source. They must keep reading
  // exactly as they did before the column existed, not be guessed as automated.
  it("treats a missing source as a manual send", () => {
    const [undef] = buildActivity({ ...base, emails: [email()] });
    const [nul] = buildActivity({ ...base, emails: [email({ source: null })] });
    expect(undef.kind).toBe("report_emailed");
    expect(nul.kind).toBe("report_emailed");
  });

  it("treats an unrecognised source as manual rather than scheduled", () => {
    const [e] = buildActivity({ ...base, emails: [email({ source: "something_new" })] });
    expect(e.kind).toBe("report_emailed");
  });

  it("keeps failures as failures regardless of origin", () => {
    const [e] = buildActivity({
      ...base,
      emails: [email({ source: "scheduled", status: "failed", error: "mailbox full" })],
    });
    expect(e.kind).toBe("delivery_failed");
    expect(e.detail).toBe("mailbox full");
  });

  it("omits in-flight (pending) deliveries — they have no outcome yet", () => {
    expect(buildActivity({ ...base, emails: [email({ status: "pending" })] })).toHaveLength(0);
  });
});

describe("buildActivity — ordering and sync outcomes", () => {
  it("orders newest first across every source", () => {
    const events = buildActivity({
      clients: [{ id: "c1", name: "Acme", created_at: "2026-07-01T00:00:00Z" }],
      sources: [],
      reports: [{ id: "r1", title: "July report", created_at: "2026-07-20T00:00:00Z", client_id: "c1" }],
      emails: [email({ sent_at: "2026-07-25T00:00:00Z", source: "scheduled" })],
    });
    expect(events.map((e) => e.kind)).toEqual(["scheduled_report_sent", "report_generated", "client_added"]);
  });

  it("reports a source error as sync_failed and never also as completed", () => {
    const events = buildActivity({
      ...base,
      clients: [{ id: "c1", name: "Acme", created_at: "2026-07-01T00:00:00Z" }],
      sources: [{ client_id: "c1", type: "gsc", created_at: "2026-07-01T00:00:00Z", last_synced_at: "2026-07-26T00:00:00Z", last_sync_error: "token expired" }],
    });
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("sync_failed");
    expect(kinds).not.toContain("sync_completed");
  });

  it("emits no sync event for a source that has never synced", () => {
    // Distinct timestamps: events sharing an instant have no defined order
    // between them, so asserting one would be testing sort stability, not behaviour.
    const events = buildActivity({
      ...base,
      clients: [{ id: "c1", name: "Acme", created_at: "2026-07-01T00:00:00Z" }],
      sources: [{ client_id: "c1", type: "gsc", created_at: "2026-07-02T00:00:00Z", last_synced_at: null, last_sync_error: null }],
    });
    expect(events.map((e) => e.kind)).toEqual(["integration_connected", "client_added"]);
  });
});

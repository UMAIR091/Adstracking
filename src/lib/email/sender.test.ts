// White-label mail may only go out from a domain the server confirmed with
// Resend. This file pins the send-side half of that rule: an unverified domain
// never sends, a verified one keeps working, and the platform's own domain is
// never handed to a tenant even when a row claims it. The database half, that
// tenants can't write email_domains at all, is checked against Postgres by
// scripts/verify-email-domain-lockdown.mjs.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSender, isReservedSendingDomain } from "./sender";

type AgencyRow = {
  name: string;
  contact_email: string | null;
  email_sender_name: string | null;
  email_sender_email: string | null;
  email_reply_to: string | null;
};
type DomainRow = { domain: string; status: string } | null;

function fakeClient(agency: Partial<AgencyRow>, domain: DomainRow): SupabaseClient {
  const rowFor = (table: string) =>
    table === "agencies"
      ? { name: "Acme Marketing", contact_email: "hello@acme.com", email_sender_name: null, email_sender_email: null, email_reply_to: null, ...agency }
      : domain;
  return {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: rowFor(table), error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const send = (agency: Partial<AgencyRow>, domain: DomainRow) => resolveSender(fakeClient(agency, domain), "a1");

let savedFrom: string | undefined;
beforeEach(() => {
  savedFrom = process.env.EMAIL_FROM;
  process.env.EMAIL_FROM = "ReportFlow <reports@tryreportflow.com>";
});
afterEach(() => {
  if (savedFrom === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = savedFrom;
});

describe("white-label sending", () => {
  it("sends from the agency's own address once its domain is verified", async () => {
    const sender = await send({ email_sender_email: "reports@acme.com" }, { domain: "acme.com", status: "verified" });

    expect(sender).toMatchObject({
      whiteLabel: true,
      from: "Acme Marketing <reports@acme.com>",
      fromEmail: "reports@acme.com",
      fromDomain: "acme.com",
      replyTo: "hello@acme.com",
    });
  });

  it.each(["not_started", "pending", "failed", "temporary_failure", "VERIFIED", "verified "])(
    "never sends from a domain whose status is %j",
    async (status) => {
      const sender = await send({ email_sender_email: "reports@acme.com" }, { domain: "acme.com", status });

      expect(sender).toMatchObject({ whiteLabel: false, fromEmail: "reports@tryreportflow.com", fromDomain: "tryreportflow.com" });
    }
  );

  it("uses the platform sender when the agency has no sending domain", async () => {
    const sender = await send({ email_sender_email: "reports@acme.com" }, null);

    expect(sender).toMatchObject({ whiteLabel: false, fromEmail: "reports@tryreportflow.com" });
  });

  it.each(["reports@evil.example", "reports@mail.acme.com", "reports@acme.com.evil.example", "not-an-address"])(
    "uses the platform sender when the sender address %s isn't on the verified domain",
    async (email) => {
      const sender = await send({ email_sender_email: email }, { domain: "acme.com", status: "verified" });

      expect(sender).toMatchObject({ whiteLabel: false, fromEmail: "reports@tryreportflow.com" });
    }
  );

  it("never sends as an arbitrary address on the platform's domain, even from a row that claims it", async () => {
    const sender = await send(
      { email_sender_email: "billing@tryreportflow.com", email_sender_name: "ReportFlow Billing" },
      { domain: "tryreportflow.com", status: "verified" }
    );

    expect(sender).toMatchObject({ whiteLabel: false, fromEmail: "reports@tryreportflow.com" });
    expect(sender?.from).not.toContain("billing@");
  });

  it("refuses reserved subdomains too", async () => {
    const sender = await send({ email_sender_email: "ceo@mail.tryreportflow.com" }, { domain: "mail.tryreportflow.com", status: "verified" });

    expect(sender).toMatchObject({ whiteLabel: false, fromEmail: "reports@tryreportflow.com" });
  });
});

describe("reserved sending domains", () => {
  it.each(["tryreportflow.com", "TryReportFlow.com", "mail.tryreportflow.com", "reportflow.com", " reportflow.com "])(
    "treats %j as reserved",
    (domain) => {
      expect(isReservedSendingDomain(domain)).toBe(true);
    }
  );

  it("reserves whatever domain EMAIL_FROM uses", () => {
    process.env.EMAIL_FROM = "reports@platform-mail.example";

    expect(isReservedSendingDomain("platform-mail.example")).toBe(true);
    expect(isReservedSendingDomain("eu.platform-mail.example")).toBe(true);
  });

  it.each(["acme.com", "notreportflow.com", "reportflow.com.acme.com"])("does not reserve the agency domain %s", (domain) => {
    expect(isReservedSendingDomain(domain)).toBe(false);
  });
});

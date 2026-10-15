import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/monitoring", () => ({ captureException: () => {} }));

import { listMicrosoftAdsAccounts } from "./microsoftAds";
import { logDetail, publicMessage, UserFacingError } from "@/lib/errors";

// The SOAP fault Microsoft returned on 15 Oct 2026 when someone signed in with a
// login that has no Microsoft Advertising user behind it.
const FAULT_105 =
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault>` +
  `<faultcode>s:Server</faultcode><faultstring>Invalid client data. Check the SOAP fault details for more information.</faultstring>` +
  `<detail><ApiFault xmlns="https://bingads.microsoft.com/Customer/v13/Exception"><OperationErrors><OperationError>` +
  `<Code>105</Code><Details/><ErrorCode>InvalidCredentials</ErrorCode>` +
  `<Message>Authentication failed. Either supplied credentials are invalid or the account is inactive</Message>` +
  `</OperationError></OperationErrors></ApiFault></detail></s:Fault></s:Body></s:Envelope>`;

const FAULT_126 = FAULT_105.replace("<Code>105</Code>", "<Code>126</Code>").replace("InvalidCredentials", "IdentityTypeMismatch");

function respondWith(body: string) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 500 })));
}

beforeAll(() => {
  process.env.MICROSOFT_ADS_DEVELOPER_TOKEN = "dev-token";
});
afterEach(() => {
  vi.unstubAllGlobals();
});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("Microsoft Ads sign-in with a login that has no ads account (105)", () => {
  it("tells a Microsoft sign-in to try the Google option", async () => {
    respondWith(FAULT_105);
    const err = await listMicrosoftAdsAccounts("token", "microsoft").catch((e) => e);
    expect(err).toBeInstanceOf(UserFacingError);
    expect(publicMessage(err, "Couldn't connect Microsoft Ads.")).toContain('choose "Continue with Google"');
  });

  it("tells a Google sign-in to pick the right Google account or use Microsoft", async () => {
    respondWith(FAULT_105);
    const err = await listMicrosoftAdsAccounts("token", "google").catch((e) => e);
    expect(publicMessage(err, "Couldn't connect Microsoft Ads.")).toContain('choose "Continue with Microsoft"');
  });

  it("keeps the provider's code for the error log", async () => {
    respondWith(FAULT_105);
    const err = await listMicrosoftAdsAccounts("token", "microsoft").catch((e) => e);
    expect(logDetail(err)).toContain("Code=105 ErrorCode=InvalidCredentials");
  });
});

describe("Microsoft Ads sign-in with the wrong button (126)", () => {
  it("shows the switch-buttons hint instead of the generic fallback", async () => {
    respondWith(FAULT_126);
    const err = await listMicrosoftAdsAccounts("token", "microsoft").catch((e) => e);
    const shown = publicMessage(err, "Couldn't connect Microsoft Ads.");
    expect(shown).toContain("uses a different sign-in method");
    expect(shown).not.toContain("ref:");
  });
});

describe("other Microsoft Ads faults", () => {
  it("stay behind the generic message", async () => {
    respondWith(FAULT_105.replace("<Code>105</Code>", "<Code>0</Code>").replace("InvalidCredentials", "InternalError"));
    const err = await listMicrosoftAdsAccounts("token", "microsoft").catch((e) => e);
    expect(err).not.toBeInstanceOf(UserFacingError);
    expect(publicMessage(err, "Couldn't connect Microsoft Ads.")).toContain("ref:");
  });
});

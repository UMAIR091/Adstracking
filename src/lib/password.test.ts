import { describe, it, expect } from "vitest";
import { passwordChecks } from "@/lib/password";

describe("passwordChecks", () => {
  it("marks a strong password valid", () => {
    const c = passwordChecks("Str0ngPass!");
    expect(c.length).toBe(true);
    expect(c.letter).toBe(true);
    expect(c.number).toBe(true);
    expect(c.valid).toBe(true);
  });

  it("rejects short / letter-only / number-only", () => {
    expect(passwordChecks("ab1").valid).toBe(false); // too short
    expect(passwordChecks("abcdefgh").valid).toBe(false); // no number
    expect(passwordChecks("12345678").valid).toBe(false); // no letter
  });

  it("scores stronger passwords higher", () => {
    expect(passwordChecks("password1").score).toBeLessThan(passwordChecks("P@ssw0rd12345").score);
  });
});

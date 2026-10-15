import { describe, expect, it } from "vitest";
import { cn } from "./utils";

// The shared primitives default to token-driven shapes; a caller's own class
// must still replace them, exactly as it replaced the old fixed ones.
describe("cn", () => {
  it("lets a caller's radius replace the token radius", () => {
    expect(cn("rounded-control", "rounded-full")).toBe("rounded-full");
    expect(cn("rounded-card", "rounded-none")).toBe("rounded-none");
  });

  it("lets a caller's shadow replace the token shadow", () => {
    expect(cn("shadow-btn", "shadow-none")).toBe("shadow-none");
    expect(cn("shadow-card", "shadow-lg")).toBe("shadow-lg");
  });

  it("lets a caller's height and padding replace the token sizes", () => {
    expect(cn("h-[var(--btn-h)] px-3.5", "h-8")).toBe("px-3.5 h-8");
    expect(cn("p-[var(--card-pad)] pt-0", "p-0")).toBe("p-0");
  });

  it("lets a caller's colour replace the token colours", () => {
    expect(cn("border-control-line text-control-fg", "border-danger-200 text-danger-700")).toBe("border-danger-200 text-danger-700");
    expect(cn("bg-primary text-primary-fg", "bg-success-solid")).toBe("text-primary-fg bg-success-solid");
  });
});

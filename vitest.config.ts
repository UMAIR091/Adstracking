import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests for core business logic (launch audit P1-7). Fast, pure-function
// tests that guard the money/security/scheduling paths against regressions.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts"],
    setupFiles: ["tests/support/test-atlas-home.ts"],
    testTimeout: 15_000,
  },
});

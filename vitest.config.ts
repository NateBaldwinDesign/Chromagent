import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli/index.ts"],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});

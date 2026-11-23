import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "evals/lib/**/*.ts"],
      exclude: ["src/cli/index.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
        // The graders. Lower, because starting real agents (runAgent, gradeWithRubric) isn't unit tested.
        "evals/lib/**": { lines: 90, functions: 85, statements: 88, branches: 78 },
      },
    },
  },
});

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".tmp", "dist", "coverage", "node_modules", "evals/results", "evals/fixtures/**", "scripts/studio-reference/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  { files: ["tests/**"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
);

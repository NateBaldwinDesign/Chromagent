import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".tmp", "dist", "coverage", "node_modules", "evals/results", "evals/fixtures/**", "scripts/studio-reference/**", "skills/chromagentic/scripts/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  { files: ["tests/**"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
  { files: ["scripts/*.mjs"], languageOptions: { globals: { console: "readonly", process: "readonly" } } },
);

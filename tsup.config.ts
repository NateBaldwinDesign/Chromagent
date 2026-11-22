import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const define = { __CHROMAGENTIC_VERSION__: JSON.stringify(version) };

export default defineConfig([
  {
    entry: { index: "src/index.ts", "cli/index": "src/cli/index.ts", runtime: "src/runtime/index.ts" },
    format: ["esm"],
    target: "node20",
    dts: { entry: { index: "src/index.ts", runtime: "src/runtime/index.ts" } },
    clean: true,
    sourcemap: false,
    splitting: true,
    define,
  },
  {
    // One offline file inside the skill, so the skill works without npm install.
    entry: { chromagentic: "src/cli/index.ts" },
    outDir: "skills/chromagentic/scripts",
    outExtension: () => ({ js: ".mjs" }),
    format: ["esm"],
    platform: "node",
    target: "node20",
    noExternal: [/.*/],
    minify: true,
    splitting: false,
    clean: false,
    sourcemap: false,
    define,
  },
  {
    // Browser copy of the personalization runtime for the skill, with no dependencies to install.
    entry: { "chromagentic-runtime": "src/runtime/index.ts" },
    outDir: "skills/chromagentic/scripts",
    outExtension: () => ({ js: ".mjs" }),
    format: ["esm"],
    platform: "browser",
    target: "es2020",
    noExternal: [/.*/],
    minify: true,
    splitting: false,
    clean: false,
    sourcemap: false,
    define,
  },
]);

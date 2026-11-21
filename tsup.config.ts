import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const define = { __CHROMAGENT_VERSION__: JSON.stringify(version) };

export default defineConfig([
  {
    entry: { index: "src/index.ts", "cli/index": "src/cli/index.ts" },
    format: ["esm"],
    target: "node20",
    dts: { entry: { index: "src/index.ts" } },
    clean: true,
    sourcemap: false,
    splitting: true,
    define,
  },
  {
    // One offline file inside the skill, so the skill works without npm install.
    entry: { chromagent: "src/cli/index.ts" },
    outDir: "skills/chromagent/scripts",
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
]);

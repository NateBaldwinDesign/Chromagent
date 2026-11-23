import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const define = { __CHROMAGENTIC_VERSION__: JSON.stringify(version) };
const banner = {
  js: `/*! Chromagentic ${version} | Apache-2.0 | https://github.com/NateBaldwinDesign/Chromagentic\n * Includes colorjs.io (MIT, Lea Verou and Chris Lilley) and code adapted from Adobe Spectrum Studio (Apache-2.0). See NOTICE. */`,
};

export default defineConfig([
  {
    entry: { index: "src/index.ts", "cli/index": "src/cli/index.ts", runtime: "src/runtime/index.ts" },
    format: ["esm"],
    target: "node22",
    dts: { entry: { index: "src/index.ts", runtime: "src/runtime/index.ts" } },
    clean: true,
    sourcemap: false,
    splitting: true,
    define,
  },
  {
    // One offline file inside the skill, so the skill works without npm install. Left unminified so
    // agents and reviewers can read exactly what they run.
    entry: { chromagentic: "src/cli/index.ts" },
    outDir: "skills/chromagentic/scripts",
    outExtension: () => ({ js: ".mjs" }),
    format: ["esm"],
    platform: "node",
    target: "node22",
    noExternal: [/.*/],
    minify: false,
    banner,
    esbuildOptions(options) {
      options.legalComments = "none";
    },
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
    // Minified because it ships to people's browsers.
    minify: true,
    banner,
    esbuildOptions(options) {
      options.legalComments = "none";
    },
    splitting: false,
    clean: false,
    sourcemap: false,
    define,
  },
]);

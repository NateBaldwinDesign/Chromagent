#!/usr/bin/env node
// Copies the version in package.json to the skill and the Claude Code plugin. `npm version` runs this
// (the "version" script), so `npm version minor` bumps every file in one commit.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

const pluginPath = ".claude-plugin/plugin.json";
writeFileSync(pluginPath, readFileSync(pluginPath, "utf8").replace(/("version":\s*)"[^"]*"/, `$1"${version}"`));

const skillPath = "skills/chromagentic/SKILL.md";
const skill = readFileSync(skillPath, "utf8");
const synced = skill.replace(/^(metadata:\n(?: {2}.*\n)*? {2}version: )"?[^"\n]+"?/m, `$1"${version}"`);
if (synced === skill && !skill.includes(`version: "${version}"`)) throw new Error(`Couldn't find metadata.version in ${skillPath}.`);
writeFileSync(skillPath, synced);

// Pinned links in the docs: the settings schema URL (".../Chromagentic/v1.2.3/...") and `gh skill install ... chromagentic@v1.2.3`.
const docs = ["README.md", "skills/chromagentic/references/engine.md"];
for (const path of docs) {
  const text = readFileSync(path, "utf8");
  writeFileSync(path, text.replace(/(Chromagentic\/|chromagentic@)v\d+\.\d+\.\d+(?:-[\w.]+)?/g, `$1v${version}`));
}

console.log(`Version ${version} copied to ${pluginPath}, ${skillPath}, and ${docs.join(", ")}.`);

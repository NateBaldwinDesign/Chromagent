import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

export type Agent = "copilot" | "claude" | "cursor";
export const AGENTS: Agent[] = ["copilot", "claude", "cursor"];

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? listFiles(join(dir, entry.name), base) : [relative(base, join(dir, entry.name))])),
  );
  return files.flat().sort();
}

/** Splits YAML-style frontmatter from a markdown file. */
export function splitFrontmatter(markdown: string) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(markdown);
  if (!match) return { fields: {} as Record<string, string>, body: markdown };
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const at = line.indexOf(":");
    if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { fields, body: markdown.slice(match[0].length) };
}

async function copySkill(source: string, target: string) {
  // Replace the folder so files removed from the skill don't linger after an upgrade.
  await rm(target, { recursive: true, force: true });
  const files = await listFiles(source);
  for (const file of files) {
    await mkdir(join(target, file, ".."), { recursive: true });
    await writeFile(join(target, file), await readFile(join(source, file)));
  }
  return files.map((file) => join(target, file));
}

/** Cursor reads rules from a single .mdc file; the reference files sit beside it. */
async function installCursor(source: string, root: string) {
  const rulesDir = join(root, ".cursor", "rules");
  const refsTarget = join(rulesDir, "chromagent");
  const written = await copySkill(join(source, "references"), join(refsTarget, "references"));
  const { fields, body } = splitFrontmatter(await readFile(join(source, "SKILL.md"), "utf8"));
  const rewritten = body.replaceAll("](references/", "](chromagent/references/").replaceAll("`references/", "`.cursor/rules/chromagent/references/");
  const description = JSON.stringify(fields.description ?? "Color for user interfaces with the chromagent engine.");
  const mdc = `---\ndescription: ${description}\nalwaysApply: false\n---\n${rewritten}`;
  const mdcPath = join(rulesDir, "chromagent.mdc");
  await writeFile(mdcPath, mdc);
  return [mdcPath, ...written];
}

export const INSTALL_PATHS: Record<Agent, string> = {
  copilot: ".github/skills/chromagent",
  claude: ".claude/skills/chromagent",
  cursor: ".cursor/rules/chromagent.mdc",
};

/** Copies the chromagent skill into a project for the chosen agents. Safe to run again. */
export async function installSkill(root: string, agents: Agent[], skillSource: string) {
  const results: { agent: Agent; path: string; files: string[] }[] = [];
  for (const agent of agents) {
    const files =
      agent === "cursor" ? await installCursor(skillSource, root) : await copySkill(skillSource, join(root, INSTALL_PATHS[agent]));
    results.push({ agent, path: INSTALL_PATHS[agent], files: files.map((file) => relative(root, file)) });
  }
  return results;
}

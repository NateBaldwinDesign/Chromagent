import { spawn, execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { AgentName } from "./types";

const TEXT = /\.(css|scss|html|astro|jsx?|tsx?|mjs|vue|svelte|json|swift|kt|kts|xml|md)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".build", ".gradle", ".claude", ".cursor", ".agents"]);

/** All text files under a folder, keyed by relative path. Skips installed skills and dependencies. */
export function readTextFiles(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(root, full);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || rel === join(".github", "skills")) continue;
        walk(full);
      } else if (entry.isFile() && TEXT.test(entry.name) && entry.name !== "package-lock.json" && entry.name !== "eval.json") {
        if (statSync(full).size < 2_000_000) out.set(rel, readFileSync(full, "utf8"));
      }
    }
  };
  walk(root);
  return out;
}

/** Files the agent created or changed, compared with the original practice project. */
export function changedFiles(workspace: string, fixtureDir: string): Map<string, string> {
  const before = readTextFiles(fixtureDir);
  const out = new Map<string, string>();
  for (const [path, text] of readTextFiles(workspace)) if (before.get(path) !== text) out.set(path, text);
  return out;
}

/** Where the standard installers put a project skill, for each kind of agent. */
export const SKILL_FOLDERS = [".agents/skills", ".github/skills", ".claude/skills"];

/**
 * Copy a practice project into a fresh folder. With `skillDir`, also install the skill the way
 * `npx skills add` and `gh skill install` do: a plain copy in each agent's project skill folder.
 * Without it, this is the baseline: the same project with no skill.
 */
export function prepareWorkspace(fixtureDir: string, workspace: string, skillDir?: string) {
  mkdirSync(workspace, { recursive: true });
  cpSync(fixtureDir, workspace, { recursive: true, filter: (src) => !src.endsWith("eval.json") });
  if (!skillDir) return;
  for (const folder of SKILL_FOLDERS) cpSync(skillDir, join(workspace, folder, "chromagentic"), { recursive: true });
}

export interface AgentRun {
  output: string;
  durationMs: number;
  timedOut: boolean;
  exitCode: number | null;
}

export function agentCommand(agent: AgentName, prompt: string, model?: string): [string, string[]] {
  if (agent === "copilot") {
    const args = ["-p", prompt, "--allow-all-tools", "--allow-all-paths", "--output-format", "json"];
    return ["copilot", model ? [...args, "--model", model] : args];
  }
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"];
  return ["claude", model ? [...args, "--model", model] : args];
}

/** Run an agent without a terminal. macOS has no `timeout` command, so a timer stops long runs. */
export function runAgent(agent: AgentName, prompt: string, cwd: string, timeoutMs: number, model?: string): Promise<AgentRun> {
  const [command, args] = agentCommand(agent, prompt, model);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NO_COLOR: "1" } });
    let output = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", () => undefined);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    const finish = (exitCode: number | null) => {
      clearTimeout(timer);
      resolve({ output, durationMs: Date.now() - started, timedOut, exitCode });
    };
    child.on("close", finish);
    child.on("error", () => finish(null));
  });
}

export function commandExists(command: string): boolean {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

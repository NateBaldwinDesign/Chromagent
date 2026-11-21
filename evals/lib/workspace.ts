import { spawn, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { AgentName } from "./types";

const TEXT = /\.(css|scss|html|astro|jsx?|tsx?|mjs|vue|svelte|json|swift|kt|kts|xml|md)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".build", ".gradle", ".claude", ".cursor"]);

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

/**
 * Pack the built package once and install it (with its dependencies) into a cache folder,
 * so every workspace gets the same `node_modules` without going to the network again.
 */
export function installPackage(repoRoot: string, cacheDir: string): string {
  if (!existsSync(join(repoRoot, "dist", "cli", "index.js"))) {
    throw new Error("The package isn't built yet. Run `npm run build` first.");
  }
  mkdirSync(cacheDir, { recursive: true });
  const name = execFileSync("npm", ["pack", "--silent", "--pack-destination", cacheDir], { cwd: repoRoot, encoding: "utf8" }).trim().split("\n").pop()!;
  const install = join(cacheDir, "install");
  mkdirSync(install, { recursive: true });
  writeFileSync(join(install, "package.json"), JSON.stringify({ name: "chromagent-eval", private: true }));
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--silent", join(cacheDir, name)], { cwd: install, stdio: "ignore" });
  return join(install, "node_modules");
}

/** Copy a practice project into a fresh folder, add the package, and install the skill for one agent. */
export function prepareWorkspace(fixtureDir: string, workspace: string, nodeModules: string, agent: AgentName) {
  mkdirSync(workspace, { recursive: true });
  cpSync(fixtureDir, workspace, { recursive: true, filter: (src) => !src.endsWith("eval.json") });
  // A real copy, not a link: if the agent runs `npm install`, other runs are not affected.
  cpSync(nodeModules, join(workspace, "node_modules"), { recursive: true, verbatimSymlinks: true });
  execFileSync("node", [join(workspace, "node_modules", "chromagent", "dist", "cli", "index.js"), "init", "--agent", agent], {
    cwd: workspace,
    stdio: "ignore",
  });
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

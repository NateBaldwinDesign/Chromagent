/**
 * Agent evals: `npm run eval -- [--agent copilot|claude|all] [--scenario id[,id]|all] [--runs N]
 *   [--parallel N] [--no-rubric] [--grader copilot|claude] [--model name] [--timeout minutes] [--keep]`
 *
 * These start real agents and use AI credits. Build first: `npm run build`.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { runChecks } from "./lib/checks";
import { gradeWithRubric } from "./lib/rubric";
import { runPassed, toMarkdown, summarize, writeReport } from "./lib/report";
import { parseTranscript } from "./lib/transcript";
import { changedFiles, commandExists, installPackage, prepareWorkspace, readTextFiles, runAgent } from "./lib/workspace";
import type { AgentName, FixtureInfo, RunResult, Scenario } from "./lib/types";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

export function loadScenarios(dir = join(here, "scenarios")): Scenario[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => parseYaml(readFileSync(join(dir, f), "utf8")) as Scenario);
}

export function loadFixture(name: string, dir = join(here, "fixtures")): FixtureInfo {
  return { name, ...JSON.parse(readFileSync(join(dir, name, "eval.json"), "utf8")) };
}

async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length) await work(queue.shift()!);
  }));
}

async function main() {
  const { values } = parseArgs({
    options: {
      agent: { type: "string", default: "copilot" },
      scenario: { type: "string", default: "all" },
      runs: { type: "string", default: "1" },
      parallel: { type: "string", default: "3" },
      "no-rubric": { type: "boolean", default: false },
      grader: { type: "string" },
      model: { type: "string" },
      timeout: { type: "string", default: "15" },
      keep: { type: "boolean", default: false },
    },
  });
  const agents: AgentName[] = values.agent === "all" ? ["copilot", "claude"] : [values.agent as AgentName];
  for (const agent of agents) {
    if (agent !== "copilot" && agent !== "claude") throw new Error(`Unknown agent "${agent}". Use copilot, claude, or all.`);
    if (!commandExists(agent)) throw new Error(`The "${agent}" command isn't installed.`);
  }
  const all = loadScenarios();
  const wanted = values.scenario === "all" ? all : all.filter((s) => values.scenario!.split(",").includes(s.id));
  if (!wanted.length) throw new Error(`No scenario matches "${values.scenario}". Choose from: ${all.map((s) => s.id).join(", ")}.`);
  const runs = Math.max(1, Number(values.runs));
  const useRubric = !values["no-rubric"];
  const grader = (values.grader as AgentName) ?? agents[0];

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const scratch = mkdtempSync(join(tmpdir(), "chromagent-eval-"));
  console.log(`Packing and installing chromagent into ${scratch} …`);
  const nodeModules = installPackage(repoRoot, join(scratch, "package"));
  const skillDir = join(repoRoot, "skills", "chromagent");
  const resultsDir = join(here, "results");
  const transcripts = join(resultsDir, stamp, "transcripts");
  mkdirSync(transcripts, { recursive: true });

  const jobs = agents.flatMap((agent) => wanted.flatMap((scenario) => Array.from({ length: runs }, (_, i) => ({ agent, scenario, run: i + 1 }))));
  console.log(`Running ${jobs.length} agent run(s): ${wanted.map((s) => s.id).join(", ")} × ${agents.join(", ")} × ${runs}.`);
  const results: RunResult[] = [];

  await pool(jobs, Number(values.parallel), async ({ agent, scenario, run }) => {
    const fixtureDir = join(here, "fixtures", scenario.fixture);
    const fixture = loadFixture(scenario.fixture);
    const workspace = join(scratch, `${scenario.id}-${agent}-${run}`);
    prepareWorkspace(fixtureDir, workspace, nodeModules, agent);
    const out = await runAgent(agent, scenario.prompt, workspace, Number(values.timeout) * 60_000, values.model);
    const id = `${scenario.id}-${agent}-${run}`;
    writeFileSync(join(transcripts, `${id}.jsonl`), out.output);
    const transcript = parseTranscript(agent, out.output);
    const checks = runChecks({
      scenario,
      fixture,
      transcript,
      workspace,
      files: readTextFiles(workspace),
      original: readTextFiles(fixtureDir),
      changed: changedFiles(workspace, fixtureDir),
    });
    if (out.timedOut) checks.unshift({ name: "finished", status: "fail", detail: `Stopped after ${values.timeout} minutes.` });
    if (transcript.error) checks.unshift({ name: "finished", status: "fail", detail: transcript.error.slice(0, 200) });
    if (useRubric && !transcript.error) checks.push(await gradeWithRubric(grader, scenario, transcript.finalMessage, skillDir));
    const result: RunResult = { scenario: scenario.id, agent, run, fixture: fixture.name, durationMs: out.durationMs, workspace, checks, passed: runPassed(checks) };
    results.push(result);
    console.log(`${result.passed ? "PASS" : "FAIL"} ${id} (${Math.round(out.durationMs / 1000)}s): ${checks.filter((c) => c.status === "fail").map((c) => c.name).join(", ") || "all checks passed"}`);
  });

  results.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.agent.localeCompare(b.agent) || a.run - b.run);
  const dir = writeReport(resultsDir, stamp, results);
  console.log("\n" + toMarkdown(summarize(results), results).split("## Runs")[0]);
  console.log(`Report saved to ${dir}`);
  if (values.keep) console.log(`Workspaces kept in ${scratch}`);
  else if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

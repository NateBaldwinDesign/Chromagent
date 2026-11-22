/**
 * Agent evals: `npm run eval -- [--agent copilot|claude|all] [--scenario id[,id]|all] [--runs N]
 *   [--baseline | --compare] [--parallel N] [--no-rubric] [--grader copilot|claude] [--model name]
 *   [--timeout minutes] [--keep]`
 *
 * By default each run has the skill installed. `--baseline` runs without it, and `--compare` runs both,
 * so the report shows how much the skill helps. These start real agents and use AI credits.
 * Build first (`npm run build`) so the bundled engine in the skill folder is current.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { runChecks, type CheckContext } from "./lib/checks";
import { scoreRun } from "./lib/outcome";
import { gradeWithRubric } from "./lib/rubric";
import { runPassed, toMarkdown, summarize, writeReport } from "./lib/report";
import { parseTranscript } from "./lib/transcript";
import { changedFiles, commandExists, prepareWorkspace, readTextFiles, runAgent } from "./lib/workspace";
import type { AgentName, Condition, FixtureInfo, RunResult, Scenario } from "./lib/types";

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
      baseline: { type: "boolean", default: false },
      compare: { type: "boolean", default: false },
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
  const conditions: Condition[] = values.compare ? ["baseline", "skill"] : values.baseline ? ["baseline"] : ["skill"];

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const scratch = mkdtempSync(join(tmpdir(), "chromagentic-eval-"));
  const skillDir = join(repoRoot, "skills", "chromagentic");
  if (!existsSync(join(skillDir, "scripts", "chromagentic.mjs"))) throw new Error("The skill's engine isn't built yet. Run `npm run build` first.");
  const resultsDir = join(here, "results");
  const transcripts = join(resultsDir, stamp, "transcripts");
  mkdirSync(transcripts, { recursive: true });

  const jobs = agents.flatMap((agent) =>
    wanted.flatMap((scenario) => conditions.flatMap((condition) => Array.from({ length: runs }, (_, i) => ({ agent, scenario, condition, run: i + 1 })))),
  );
  console.log(`Running ${jobs.length} agent run(s): ${wanted.map((s) => s.id).join(", ")} × ${agents.join(", ")} × ${conditions.join(" and ")} × ${runs}.`);
  const results: RunResult[] = [];

  await pool(jobs, Number(values.parallel), async ({ agent, scenario, condition, run }) => {
    const fixtureDir = join(here, "fixtures", scenario.fixture);
    const fixture = loadFixture(scenario.fixture);
    const id = `${scenario.id}-${agent}-${condition}-${run}`;
    const workspace = join(scratch, id);
    prepareWorkspace(fixtureDir, workspace, condition === "skill" ? skillDir : undefined);
    const out = await runAgent(agent, scenario.prompt, workspace, Number(values.timeout) * 60_000, values.model);
    writeFileSync(join(transcripts, `${id}.jsonl`), out.output);
    const transcript = parseTranscript(agent, out.output);
    const ctx: CheckContext = {
      scenario,
      fixture,
      transcript,
      workspace,
      files: readTextFiles(workspace),
      original: readTextFiles(fixtureDir),
      changed: changedFiles(workspace, fixtureDir),
    };
    // The old pass/fail checks describe how the skill was used, so they only apply with the skill.
    const checks = condition === "skill" ? runChecks(ctx) : [];
    const { metrics, swatches } = scoreRun(ctx, condition);
    if (out.timedOut) checks.unshift({ name: "finished", status: "fail", detail: `Stopped after ${values.timeout} minutes.` });
    if (transcript.error) checks.unshift({ name: "finished", status: "fail", detail: transcript.error.slice(0, 200) });
    if (useRubric && condition === "skill" && !transcript.error) checks.push(await gradeWithRubric(grader, scenario, transcript.finalMessage, skillDir));
    if (out.timedOut || transcript.error) metrics.result = 0;
    const result: RunResult = { scenario: scenario.id, agent, condition, run, fixture: fixture.name, durationMs: out.durationMs, workspace, checks, passed: runPassed(checks), metrics, swatches };
    results.push(result);
    const failed = checks.filter((c) => c.status === "fail").map((c) => c.name).join(", ");
    console.log(`${id} (${Math.round(out.durationMs / 1000)}s): result ${Math.round((metrics.result ?? 0) * 100)}%${failed ? `; failed checks: ${failed}` : ""}`);
  });

  results.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.agent.localeCompare(b.agent) || a.condition.localeCompare(b.condition) || a.run - b.run);
  const dir = writeReport(resultsDir, stamp, results);
  console.log("\n" + toMarkdown(summarize(results), results).split("## Scores by scenario")[0]);
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

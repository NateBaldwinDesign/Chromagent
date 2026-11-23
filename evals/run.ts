/**
 * Agent evals: `npm run eval -- [--agent copilot|claude|all] [--scenario id[,id]|all] [--runs N]
 *   [--baseline | --compare] [--triggers] [--parallel N] [--no-rubric] [--grader copilot|claude]
 *   [--model name] [--timeout minutes] [--keep]`
 *
 * By default each run has the skill installed. `--baseline` runs without it, and `--compare` runs both,
 * so the report shows how much the skill helps. `--triggers` runs the trigger suite instead: prompts
 * that should and shouldn't load the skill. These start real agents and use AI credits.
 * Build first (`npm run build`) so the bundled engine in the skill folder is current.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { runChecks, type CheckContext } from "./lib/checks";
import { scoreRun, skillTriggered } from "./lib/outcome";
import { gradeWithRubric } from "./lib/rubric";
import { toReplay } from "./lib/replay";
import { runPassed, toMarkdown, summarize, triggerSummary, writeReport, type Provenance, type TriggerResult } from "./lib/report";
import { parseTranscript } from "./lib/transcript";
import { changedFiles, commandExists, prepareWorkspace, readTextFiles, runAgent, SKILL_FOLDERS } from "./lib/workspace";
import type { AgentName, Condition, FixtureInfo, RunResult, Scenario, Transcript } from "./lib/types";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

export function loadScenarios(dir = join(here, "scenarios")): Scenario[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b))
    .map((f) => parseYaml(readFileSync(join(dir, f), "utf8")) as Scenario);
}

export function loadFixture(name: string, dir = join(here, "fixtures")): FixtureInfo {
  return { name, ...JSON.parse(readFileSync(join(dir, name, "eval.json"), "utf8")) };
}

/** SHA-256 of every file in a folder, in path order. */
export function folderHash(dir: string): string {
  const hash = createHash("sha256");
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else hash.update(full.slice(dir.length)).update(readFileSync(full));
    }
  };
  walk(dir);
  return hash.digest("hex");
}

/** Why a run without the skill doesn't count: it could see the skill anyway. Undefined when it's clean. */
export function contamination(t: Transcript): string | undefined {
  if (t.skillsLoaded?.some((name) => /chromagentic/i.test(name))) return "the agent listed chromagentic among its loaded skills";
  if ([...t.commands, ...t.toolArgs, t.finalMessage].some((x) => /chromagentic/i.test(x))) return "the run mentions chromagentic";
  return undefined;
}

/** Skill folders in the user's home that every agent run would see, even the baseline. */
function userSkillInstalls(): string[] {
  const homes = [".copilot/skills", ".claude/skills", ".agents/skills", ...SKILL_FOLDERS];
  return [...new Set(homes)].map((f) => join(homedir(), f, "chromagentic")).filter(existsSync);
}

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
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
      runs: { type: "string", default: "5" },
      parallel: { type: "string", default: "3" },
      "no-rubric": { type: "boolean", default: false },
      grader: { type: "string" },
      model: { type: "string" },
      timeout: { type: "string", default: "15" },
      keep: { type: "boolean", default: false },
      baseline: { type: "boolean", default: false },
      compare: { type: "boolean", default: false },
      triggers: { type: "boolean", default: false },
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
  const installed = userSkillInstalls();
  if (installed.length && (conditions.includes("baseline") || values.triggers))
    throw new Error(`Chromagentic is installed for every project at ${installed.join(", ")}, so baseline and trigger runs would see it. Move it aside first.`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // A neutral name, so the folder path doesn't tell the agent what's being tested.
  const scratch = mkdtempSync(join(tmpdir(), "ws-"));
  const skillDir = join(repoRoot, "skills", "chromagentic");
  if (!existsSync(join(skillDir, "scripts", "chromagentic.mjs"))) throw new Error("The skill's engine isn't built yet. Run `npm run build` first.");
  const resultsDir = join(here, "results");
  const transcripts = join(resultsDir, stamp, "transcripts");
  mkdirSync(transcripts, { recursive: true });
  const provenance: Provenance = {
    batch: stamp,
    gitSha: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]) !== "",
    skillHash: folderHash(skillDir),
    engineVersion: JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version,
    agents: {},
    grader: useRubric ? grader : undefined,
  };
  const note = (agent: AgentName, t: Transcript) => {
    const a = (provenance.agents[agent] ??= { models: [] });
    a.version ??= t.agentVersion;
    if (t.model && !a.models.includes(t.model)) a.models.push(t.model);
  };
  const timeoutMs = Number(values.timeout) * 60_000;

  if (values.triggers) {
    const suite = parseYaml(readFileSync(join(here, "triggers.yaml"), "utf8")) as { fixture: string; prompts: { prompt: string; expect: boolean }[] };
    const jobs = agents.flatMap((agent) => suite.prompts.flatMap((p) => Array.from({ length: runs }, () => ({ agent, ...p }))));
    console.log(`Running ${jobs.length} trigger run(s).`);
    const found: TriggerResult[] = [];
    await pool(jobs, Number(values.parallel), async ({ agent, prompt, expect }) => {
      const workspace = join(scratch, randomBytes(4).toString("hex"));
      prepareWorkspace(join(here, "fixtures", suite.fixture), workspace, skillDir);
      const out = await runAgent(agent, prompt, workspace, timeoutMs, values.model);
      const transcript = parseTranscript(agent, out.output);
      note(agent, transcript);
      const ctx = { transcript } as CheckContext;
      found.push({ prompt, agent, expect, triggered: skillTriggered(ctx) === 1 });
    });
    const t = triggerSummary(found);
    const lines = [
      "# Chromagentic trigger report",
      "",
      `${stamp} · ${t.runs} runs · commit ${provenance.gitSha.slice(0, 10)} · skill ${provenance.skillHash.slice(0, 12)}`,
      "",
      `Precision ${t.precision === null ? "–" : `${Math.round(t.precision * 100)}%`} (when it loaded, it should have). Recall ${t.recall === null ? "–" : `${Math.round(t.recall * 100)}%`} (when it should load, it did).`,
      "",
      ...t.misses.map((m) => `- ${m}`),
    ];
    writeFileSync(join(resultsDir, stamp, "triggers.json"), JSON.stringify({ provenance, summary: t, results: found }, null, 2));
    writeFileSync(join(resultsDir, stamp, "triggers.md"), lines.join("\n") + "\n");
    console.log(lines.join("\n"));
    if (!values.keep) rmSync(scratch, { recursive: true, force: true });
    return;
  }

  const jobs = agents.flatMap((agent) =>
    wanted.flatMap((scenario) => conditions.flatMap((condition) => Array.from({ length: runs }, (_, i) => ({ agent, scenario, condition, run: i + 1 })))),
  );
  console.log(`Running ${jobs.length} agent run(s): ${wanted.map((s) => s.id).join(", ")} × ${agents.join(", ")} × ${conditions.join(" and ")} × ${runs}.`);
  const results: RunResult[] = [];

  await pool(jobs, Number(values.parallel), async ({ agent, scenario, condition, run }) => {
    const fixtureDir = join(here, "fixtures", scenario.fixture);
    const fixture = loadFixture(scenario.fixture);
    const id = `${scenario.id}-${agent}-${condition}-${run}`;
    const workspace = join(scratch, randomBytes(4).toString("hex"));
    prepareWorkspace(fixtureDir, workspace, condition === "skill" ? skillDir : undefined);
    const out = await runAgent(agent, scenario.prompt, workspace, timeoutMs, values.model);
    writeFileSync(join(transcripts, `${id}.jsonl`), out.output);
    const transcript = parseTranscript(agent, out.output);
    note(agent, transcript);
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
    // Both conditions get the same grader with the same facts.
    if (useRubric && !transcript.error) {
      const graded = await gradeWithRubric(grader, scenario, transcript.finalMessage, skillDir);
      if (condition === "skill") checks.push(graded.check);
      metrics.accurate = graded.accurate;
      metrics.explains = graded.explains;
    }
    if (out.timedOut || transcript.error) metrics.core = 0;
    const contaminated = condition === "baseline" ? contamination(transcript) : undefined;
    const result: RunResult = {
      scenario: scenario.id, agent, condition, run, fixture: fixture.name, durationMs: out.durationMs, workspace, checks, passed: runPassed(checks), metrics, swatches,
      model: transcript.model, agentVersion: transcript.agentVersion, usage: transcript.usage, contaminated,
    };
    results.push(result);
    mkdirSync(join(resultsDir, stamp, "replay"), { recursive: true });
    writeFileSync(join(resultsDir, stamp, "replay", `${id}.json`), JSON.stringify(toReplay(result, ctx), null, 2));
    const failed = checks.filter((c) => c.status === "fail").map((c) => c.name).join(", ");
    console.log(`${id} (${Math.round(out.durationMs / 1000)}s): core ${Math.round((metrics.core ?? 0) * 100)}%${contaminated ? ` (left out: ${contaminated})` : ""}${failed ? `; failed checks: ${failed}` : ""}`);
  });

  results.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.agent.localeCompare(b.agent) || a.condition.localeCompare(b.condition) || a.run - b.run);
  const dir = writeReport(resultsDir, stamp, results, provenance);
  console.log("\n" + toMarkdown(summarize(results, undefined, provenance), results).split("## Scores by scenario")[0]);
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

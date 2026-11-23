/**
 * Replays: a run's changed files and transcript, saved so it can be graded again later without
 * starting an agent. `evals/replay/` holds a few committed cases that the unit tests re-grade, so a
 * change to the graders that moves their scores shows up in CI at no cost.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CheckContext } from "./checks";
import { scoreRun } from "./outcome";
import { readTextFiles } from "./workspace";
import type { Condition, FixtureInfo, Metrics, RunResult, Scenario, Transcript } from "./types";

export interface ReplayCase {
  /** Scenario id, from `evals/scenarios`. */
  scenario: string;
  condition: Condition;
  /** What this case shows, for people reading it. */
  note?: string;
  /** Files the agent created or changed, by relative path. */
  changed: Record<string, string>;
  transcript: Pick<Transcript, "commands" | "toolArgs" | "finalMessage">;
  /** The scores when the case was saved. */
  metrics?: Metrics;
  /** For hand-written cases: the range each score must land in. */
  expect?: Record<string, [number, number]>;
}

export function toReplay(result: RunResult, ctx: CheckContext): ReplayCase {
  return {
    scenario: result.scenario,
    condition: result.condition,
    changed: Object.fromEntries(ctx.changed),
    transcript: { commands: ctx.transcript.commands, toolArgs: ctx.transcript.toolArgs, finalMessage: ctx.transcript.finalMessage },
    metrics: result.metrics,
  };
}

/** Grade a saved case again with today's graders. */
export function regrade(replay: ReplayCase, evalsDir: string): Metrics {
  const scenario = findScenario(evalsDir, replay.scenario);
  const fixtureDir = join(evalsDir, "fixtures", scenario.fixture);
  const fixture: FixtureInfo = { name: scenario.fixture, ...JSON.parse(readFileSync(join(fixtureDir, "eval.json"), "utf8")) };
  const original = readTextFiles(fixtureDir);
  const changed = new Map(Object.entries(replay.changed));
  const ctx: CheckContext = {
    scenario,
    fixture,
    transcript: { ...replay.transcript },
    workspace: "/replay",
    files: new Map([...original, ...changed]),
    original,
    changed,
  };
  return scoreRun(ctx, replay.condition).metrics;
}

function findScenario(evalsDir: string, id: string): Scenario {
  for (const f of readdirSync(join(evalsDir, "scenarios")).filter((name) => name.endsWith(".yaml"))) {
    const scenario = parseYaml(readFileSync(join(evalsDir, "scenarios", f), "utf8")) as Scenario;
    if (scenario.id === id) return scenario;
  }
  throw new Error(`No scenario has the id "${id}".`);
}

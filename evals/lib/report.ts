import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunResult } from "./types";

/** Average and spread (sample standard deviation) of one score across runs, plus the run values. */
export interface Stat {
  mean: number;
  sd: number;
  n: number;
  values: number[];
}

export interface Cell {
  runs: number;
  /** Runs where every diagnostic check passed (only meaningful with the skill). */
  passed: number;
  metrics: Record<string, Stat>;
  /** Average seconds per run, and premium requests used in total (when the agent reports them). */
  seconds: number;
  premiumRequests: number;
}

/** What produced a batch of runs, so results can be traced and repeated. */
export interface Provenance {
  /** All runs in one report come from one batch; don't merge reports from different batches. */
  batch: string;
  gitSha: string;
  /** True when the working tree had uncommitted changes. */
  dirty: boolean;
  /** SHA-256 of every file in the skill folder. */
  skillHash: string;
  engineVersion: string;
  agents: Record<string, { version?: string; models: string[] }>;
  grader?: string;
}

export interface Summary {
  date: string;
  runs: number;
  /** Runs without the skill that could see it anyway (left out of every score). */
  excluded: number;
  provenance?: Provenance;
  /** scenario → agent → condition ("skill" or "baseline") → scores. */
  byScenario: Record<string, Record<string, Record<string, Cell>>>;
  byCheck: Record<string, { passed: number; graded: number }>;
}

/** A run passes when every check that applies passed. Skipped checks don't count either way. */
export function runPassed(checks: RunResult["checks"]): boolean {
  return checks.every((c) => c.status !== "fail");
}

function stat(values: number[]): Stat {
  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd, n, values };
}

/** A small seeded random number generator, so the same runs always give the same interval. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 95% bootstrap interval for the difference in means (b − a): resample each side's runs with
 * replacement many times and keep the middle 95% of the differences. Null with fewer than 2 runs a side.
 */
export function bootstrapDiff(a: number[], b: number[], iterations = 4000, seed = 1): [number, number] | null {
  if (a.length < 2 || b.length < 2) return null;
  const next = random(seed);
  const resampleMean = (xs: number[]) => {
    let sum = 0;
    for (let i = 0; i < xs.length; i++) sum += xs[Math.floor(next() * xs.length)];
    return sum / xs.length;
  };
  const diffs = Array.from({ length: iterations }, () => resampleMean(b) - resampleMean(a)).sort((x, y) => x - y);
  return [diffs[Math.floor(iterations * 0.025)], diffs[Math.ceil(iterations * 0.975) - 1]];
}

export function summarize(results: RunResult[], date = new Date().toISOString(), provenance?: Provenance): Summary {
  const kept = results.filter((r) => !r.contaminated);
  const summary: Summary = { date, runs: kept.length, excluded: results.length - kept.length, provenance, byScenario: {}, byCheck: {} };
  const values = new Map<Cell, Map<string, number[]>>();
  const seconds = new Map<Cell, number[]>();
  for (const r of kept) {
    const cell = (((summary.byScenario[r.scenario] ??= {})[r.agent] ??= {})[r.condition] ??= { runs: 0, passed: 0, metrics: {}, seconds: 0, premiumRequests: 0 });
    cell.runs++;
    if (r.passed) cell.passed++;
    cell.premiumRequests += r.usage?.premiumRequests ?? 0;
    seconds.set(cell, [...(seconds.get(cell) ?? []), r.durationMs / 1000]);
    const lists = values.get(cell) ?? new Map<string, number[]>();
    values.set(cell, lists);
    for (const [name, v] of Object.entries(r.metrics)) if (typeof v === "number") lists.set(name, [...(lists.get(name) ?? []), v]);
    for (const c of r.checks) {
      if (c.status === "skip") continue;
      const check = (summary.byCheck[c.name] ??= { passed: 0, graded: 0 });
      check.graded++;
      if (c.status === "pass") check.passed++;
    }
  }
  for (const [cell, lists] of values) for (const [name, list] of lists) cell.metrics[name] = stat(list);
  for (const [cell, list] of seconds) cell.seconds = Math.round(stat(list).mean);
  return summary;
}

const pct = (s?: Stat) => (s ? `${Math.round(s.mean * 100)}%${s.n > 1 ? ` ± ${Math.round(s.sd * 100)}` : ""}` : "–");
const signed = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}`;
const diff = (a?: Stat, b?: Stat) => (a && b ? `${signed(b.mean - a.mean)} pts` : "–");
const interval = (a?: Stat, b?: Stat) => {
  const ci = a && b ? bootstrapDiff(a.values, b.values) : null;
  return ci ? `${signed(ci[0])} to ${signed(ci[1])}` : "needs 2+ runs";
};

export const LABELS: Record<string, string> = {
  core: "Core score (outcomes)",
  adherence: "Follows the skill's style",
  contrast: "Contrast pass (all modes)",
  "contrast-light": "Contrast pass, light",
  "contrast-dark": "Contrast pass, dark",
  "contrast-high-contrast": "Contrast pass, high contrast",
  "contrast-low-contrast": "Contrast pass, low contrast",
  gamut: "Colors a screen can show",
  format: "Recommended color syntax",
  mood: "Mood match",
  build: "Builds",
  "new-mode": "New mode passes",
  "role-order": "Role order kept",
  balance: "Perceived contrast kept",
  "hue-kept": "Brand hues kept",
  "original-kept": "Original mode unchanged",
  switch: "Mode switch works",
  "no-full-scale": "Roles, not a full scale",
  "text-tiers": "Text tiers fit",
  cvd: "Feedback distinct in color-blind views",
  harmony: "Feedback matches brand",
  personal: "Personal colors work",
  "switch-wired": "Uses the app's theme switch",
  asked: "Asked about personal colors",
  focus: "Focus rings visible",
  "look-kept": "Look kept while fixing",
  accurate: "Reply is accurate (AI grader)",
  explains: "Reply explains the colors (AI grader)",
  triggered: "Skill triggered",
  engine: "Colors from the engine",
};

export function toMarkdown(summary: Summary, results: RunResult[]): string {
  const lines = [
    "# Chromagentic eval report",
    "",
    `${summary.date} · ${summary.runs} runs${summary.excluded ? ` (${summary.excluded} left out: the baseline could see the skill)` : ""}. Scores run from 0% to 100%; "±" is the spread across runs.`,
    "",
  ];
  const p = summary.provenance;
  if (p) {
    const agents = Object.entries(p.agents).map(([name, a]) => `${name} ${a.version ?? "?"} (${a.models.join(", ") || "default model"})`).join("; ");
    lines.push(`Batch ${p.batch} · commit ${p.gitSha.slice(0, 10)}${p.dirty ? " (uncommitted changes)" : ""} · engine ${p.engineVersion} · skill ${p.skillHash.slice(0, 12)} · ${agents}${p.grader ? ` · grader ${p.grader}` : ""}`, "");
  }
  const headline = (key: string, title: string, note: string) => {
    lines.push(`## ${title}`, "", note, "", "| Scenario | Agent | Without skill | With skill | Difference | 95% interval |", "|---|---|---|---|---|---|");
    for (const [scenario, agents] of Object.entries(summary.byScenario)) {
      for (const [agent, cells] of Object.entries(agents)) {
        const a = cells.baseline?.metrics[key];
        const b = cells.skill?.metrics[key];
        lines.push(`| ${scenario} | ${agent} | ${pct(a)} | ${pct(b)} | ${diff(a, b)} | ${interval(a, b)} |`);
      }
    }
    lines.push("");
  };
  headline("core", "Core score: with vs. without the skill", "Outcomes any good answer should reach: contrast on an sRGB screen in every needed mode, colors a screen can show, the asked-for mood, a working build, and the task's own outcomes. When the interval includes 0, the difference may be chance.");
  headline("adherence", "Follows the skill's style", "Choices the skill recommends (OKLCH or P3 syntax, roles instead of a full scale, text tiers, feedback chroma, asking about personal colors). Shown apart because a good answer may choose differently.");
  lines.push("## Time and cost", "", "| Scenario | Agent | Without skill | With skill |", "|---|---|---|---|");
  for (const [scenario, agents] of Object.entries(summary.byScenario)) {
    for (const [agent, cells] of Object.entries(agents)) {
      const show = (c?: Cell) => (c ? `${c.seconds}s a run${c.premiumRequests ? `, ${c.premiumRequests} premium requests` : ""}` : "–");
      lines.push(`| ${scenario} | ${agent} | ${show(cells.baseline)} | ${show(cells.skill)} |`);
    }
  }
  lines.push("", "## Scores by scenario", "");
  for (const [scenario, agents] of Object.entries(summary.byScenario)) {
    for (const [agent, cells] of Object.entries(agents)) {
      lines.push(`### ${scenario} · ${agent}`, "", "| Score | Without skill | With skill | Difference |", "|---|---|---|---|");
      const names = new Set([...Object.keys(cells.baseline?.metrics ?? {}), ...Object.keys(cells.skill?.metrics ?? {})]);
      for (const name of Object.keys(LABELS).filter((n) => names.has(n))) {
        const a = cells.baseline?.metrics[name];
        const b = cells.skill?.metrics[name];
        lines.push(`| ${LABELS[name]} | ${pct(a)} | ${pct(b)} | ${diff(a, b)} |`);
      }
      lines.push("");
    }
  }
  if (Object.keys(summary.byCheck).length) {
    lines.push("## Diagnostic checks (with the skill)", "", "| Check | Passed |", "|---|---|");
    for (const [name, c] of Object.entries(summary.byCheck)) lines.push(`| ${name} | ${c.passed}/${c.graded} |`);
    lines.push("");
  }
  lines.push("## Runs", "");
  for (const r of results) {
    lines.push(`### ${r.scenario} · ${r.agent} · ${r.condition === "skill" ? "with skill" : "without skill"} · run ${r.run} (${Math.round(r.durationMs / 1000)}s)`, "");
    if (r.contaminated) lines.push(`Left out: ${r.contaminated}`, "");
    const scores = Object.entries(r.metrics).filter(([, v]) => typeof v === "number");
    lines.push(scores.map(([k, v]) => `${LABELS[k] ?? k} ${Math.round((v as number) * 100)}%`).join(" · "), "");
    for (const c of r.checks) lines.push(`- **${c.name}**: ${c.status} — ${c.detail}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Save the report for this run and add one line to the history file, so later runs can be compared. */
export function writeReport(resultsDir: string, stamp: string, results: RunResult[], provenance?: Provenance): string {
  const dir = join(resultsDir, stamp);
  mkdirSync(dir, { recursive: true });
  const summary = summarize(results, undefined, provenance);
  writeFileSync(join(dir, "report.json"), JSON.stringify({ summary, results }, null, 2));
  writeFileSync(join(dir, "report.md"), toMarkdown(summary, results));
  appendFileSync(join(resultsDir, "history.jsonl"), JSON.stringify(summary) + "\n");
  return dir;
}

/** One trigger-suite run: did the skill load for a prompt that should (or shouldn't) use it? */
export interface TriggerResult {
  prompt: string;
  agent: string;
  /** True when the skill should load for this prompt. */
  expect: boolean;
  triggered: boolean;
}

/** Precision: of the runs where the skill loaded, the share that should have. Recall: of the runs that should, the share where it did. */
export function triggerSummary(results: TriggerResult[]) {
  const hit = results.filter((r) => r.expect && r.triggered).length;
  const loaded = results.filter((r) => r.triggered).length;
  const wanted = results.filter((r) => r.expect).length;
  return {
    runs: results.length,
    precision: loaded ? hit / loaded : null,
    recall: wanted ? hit / wanted : null,
    misses: results.filter((r) => r.expect !== r.triggered).map((r) => `${r.agent}: ${r.expect ? "didn't load for" : "loaded for"} "${r.prompt}"`),
  };
}

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunResult } from "./types";

/** Average and spread (sample standard deviation) of one score across runs. */
export interface Stat {
  mean: number;
  sd: number;
  n: number;
}

export interface Cell {
  runs: number;
  /** Runs where every diagnostic check passed (only meaningful with the skill). */
  passed: number;
  metrics: Record<string, Stat>;
}

export interface Summary {
  date: string;
  runs: number;
  /** scenario → agent → condition ("skill" or "baseline") → scores. */
  byScenario: Record<string, Record<string, Record<string, Cell>>>;
  byCheck: Record<string, { passed: number; graded: number }>;
}

/** A run passes when every check that applies passed. Skipped checks don't count either way. */
export function runPassed(checks: RunResult["checks"]): boolean {
  return checks.every((c) => c.status !== "fail");
}

export function stat(values: number[]): Stat {
  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd, n };
}

export function summarize(results: RunResult[], date = new Date().toISOString()): Summary {
  const summary: Summary = { date, runs: results.length, byScenario: {}, byCheck: {} };
  const values = new Map<Cell, Map<string, number[]>>();
  for (const r of results) {
    const cell = (((summary.byScenario[r.scenario] ??= {})[r.agent] ??= {})[r.condition] ??= { runs: 0, passed: 0, metrics: {} });
    cell.runs++;
    if (r.passed) cell.passed++;
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
  return summary;
}

const pct = (s?: Stat) => (s ? `${Math.round(s.mean * 100)}%${s.n > 1 ? ` ± ${Math.round(s.sd * 100)}` : ""}` : "–");
const diff = (a?: Stat, b?: Stat) => {
  if (!a || !b) return "–";
  const d = Math.round((b.mean - a.mean) * 100);
  return `${d > 0 ? "+" : ""}${d} pts`;
};

export const LABELS: Record<string, string> = {
  result: "Overall result",
  contrast: "Contrast pass (all modes)",
  "contrast-light": "Contrast pass, light",
  "contrast-dark": "Contrast pass, dark",
  "contrast-high-contrast": "Contrast pass, high contrast",
  fit: "Format and gamut fit",
  mood: "Mood match",
  build: "Builds",
  "new-mode": "New mode passes",
  "role-order": "Role order kept",
  balance: "Perceived contrast kept",
  "hue-kept": "Brand hues kept",
  "original-kept": "Original mode unchanged",
  switch: "Mode switch works",
  triggered: "Skill triggered",
  engine: "Colors from the engine",
};

export function toMarkdown(summary: Summary, results: RunResult[]): string {
  const lines = [
    "# Chromagentic eval report",
    "",
    `${summary.date} · ${summary.runs} runs. Scores run from 0% to 100%; "±" is the spread across runs.`,
    "",
    "## With vs. without the skill",
    "",
    "| Scenario | Agent | Without skill | With skill | Difference |",
    "|---|---|---|---|---|",
  ];
  for (const [scenario, agents] of Object.entries(summary.byScenario)) {
    for (const [agent, cells] of Object.entries(agents)) {
      const a = cells.baseline?.metrics.result;
      const b = cells.skill?.metrics.result;
      lines.push(`| ${scenario} | ${agent} | ${pct(a)} | ${pct(b)} | ${diff(a, b)} |`);
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
    const scores = Object.entries(r.metrics).filter(([, v]) => typeof v === "number");
    lines.push(scores.map(([k, v]) => `${LABELS[k] ?? k} ${Math.round((v as number) * 100)}%`).join(" · "), "");
    for (const c of r.checks) lines.push(`- **${c.name}**: ${c.status} — ${c.detail}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Save the report for this run and add one line to the history file, so later runs can be compared. */
export function writeReport(resultsDir: string, stamp: string, results: RunResult[]): string {
  const dir = join(resultsDir, stamp);
  mkdirSync(dir, { recursive: true });
  const summary = summarize(results);
  writeFileSync(join(dir, "report.json"), JSON.stringify({ summary, results }, null, 2));
  writeFileSync(join(dir, "report.md"), toMarkdown(summary, results));
  appendFileSync(join(resultsDir, "history.jsonl"), JSON.stringify(summary) + "\n");
  return dir;
}

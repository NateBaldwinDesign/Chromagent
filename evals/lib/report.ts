import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunResult } from "./types";

export interface Summary {
  date: string;
  runs: number;
  passed: number;
  byScenario: Record<string, Record<string, { passed: number; runs: number }>>;
  byCheck: Record<string, { passed: number; graded: number }>;
}

/** A run passes when every check that applies passed. Skipped checks don't count either way. */
export function runPassed(checks: RunResult["checks"]): boolean {
  return checks.every((c) => c.status !== "fail");
}

export function summarize(results: RunResult[], date = new Date().toISOString()): Summary {
  const summary: Summary = { date, runs: results.length, passed: 0, byScenario: {}, byCheck: {} };
  for (const r of results) {
    if (r.passed) summary.passed++;
    const cell = ((summary.byScenario[r.scenario] ??= {})[r.agent] ??= { passed: 0, runs: 0 });
    cell.runs++;
    if (r.passed) cell.passed++;
    for (const c of r.checks) {
      if (c.status === "skip") continue;
      const check = (summary.byCheck[c.name] ??= { passed: 0, graded: 0 });
      check.graded++;
      if (c.status === "pass") check.passed++;
    }
  }
  return summary;
}

const rate = (passed: number, total: number) => (total ? `${passed}/${total} (${Math.round((passed / total) * 100)}%)` : "–");

export function toMarkdown(summary: Summary, results: RunResult[]): string {
  const agents = [...new Set(results.map((r) => r.agent))];
  const lines = [
    `# Chromagent eval report`,
    "",
    `${summary.date} · ${rate(summary.passed, summary.runs)} runs passed every check.`,
    "",
    "## Pass rate by scenario",
    "",
    `| Scenario | ${agents.join(" | ")} |`,
    `|---|${agents.map(() => "---").join("|")}|`,
  ];
  for (const [scenario, cells] of Object.entries(summary.byScenario)) {
    lines.push(`| ${scenario} | ${agents.map((a) => (cells[a] ? rate(cells[a].passed, cells[a].runs) : "–")).join(" | ")} |`);
  }
  lines.push("", "## Pass rate by check", "", "| Check | Passed |", "|---|---|");
  for (const [name, c] of Object.entries(summary.byCheck)) lines.push(`| ${name} | ${rate(c.passed, c.graded)} |`);
  lines.push("", "## Runs", "");
  for (const r of results) {
    lines.push(`### ${r.scenario} · ${r.agent} · run ${r.run} — ${r.passed ? "pass" : "fail"} (${Math.round(r.durationMs / 1000)}s)`, "");
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

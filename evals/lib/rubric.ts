import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTranscript } from "./transcript";
import { runAgent } from "./workspace";
import type { AgentName, CheckResult, Scenario } from "./types";

const GUIDE = `You are grading an AI coding agent's final reply about UI color. Score it with this fixed guide.

- accurate: true when every factual claim about color, contrast, modes, gamut, or the chromagent tool agrees with the reference material below. Claims the material doesn't cover count as accurate only if they are mainstream, correct color science. Any wrong number, wrong standard, or invented chromagent feature makes it false.
- explains: true when the reply tells the user, in plain words, what was made and why (for example, what the colors are for, the contrast targets, or how modes differ).

Reply with only one line of JSON: {"accurate": true|false, "explains": true|false, "notes": "<one short sentence>"}`;

export function rubricPrompt(scenario: Scenario, finalMessage: string, reference: string): string {
  return [
    GUIDE,
    `## The user asked\n${scenario.prompt}`,
    scenario.rubric ? `## Extra facts for this task\n${scenario.rubric}` : "",
    `## Reference material\n${reference}`,
    `## The agent's final reply\n${finalMessage || "(no reply)"}`,
    "Do not use any tools. Reply with the JSON line only.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function parseRubric(reply: string): CheckResult {
  const match = reply.match(/\{[^{}]*"accurate"[^{}]*\}/);
  if (!match) return { name: "rubric", status: "skip", detail: "The grader didn't return a score." };
  try {
    const score = JSON.parse(match[0]) as { accurate?: boolean; explains?: boolean; notes?: string };
    const ok = score.accurate === true && score.explains === true;
    const parts = [`accurate: ${score.accurate ? "yes" : "no"}`, `explains: ${score.explains ? "yes" : "no"}`];
    return { name: "rubric", status: ok ? "pass" : "fail", detail: `${parts.join(", ")}. ${score.notes ?? ""}`.trim() };
  } catch {
    return { name: "rubric", status: "skip", detail: "The grader's score couldn't be read." };
  }
}

/** Reference text for the grader: the main guide plus the reference files this scenario expects. */
export function referenceText(skillDir: string, scenario: Scenario): string {
  const parts = [readFileSync(join(skillDir, "SKILL.md"), "utf8")];
  for (const file of scenario.expectReferences ?? []) {
    try {
      parts.push(`### ${file}\n${readFileSync(join(skillDir, "references", file), "utf8")}`);
    } catch {
      // A missing file is reported by the references check instead.
    }
  }
  return parts.join("\n\n").slice(0, 40_000);
}

export async function gradeWithRubric(grader: AgentName, scenario: Scenario, finalMessage: string, skillDir: string): Promise<CheckResult> {
  const dir = mkdtempSync(join(tmpdir(), "chromagent-grader-"));
  try {
    const run = await runAgent(grader, rubricPrompt(scenario, finalMessage, referenceText(skillDir, scenario)), dir, 5 * 60_000);
    return parseRubric(parseTranscript(grader, run.output).finalMessage);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

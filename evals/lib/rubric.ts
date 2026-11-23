import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTranscript } from "./transcript";
import { runAgent } from "./workspace";
import type { AgentName, CheckResult, Scenario } from "./types";

const GUIDE = `You are grading an AI coding agent's final reply about UI color. Score it with this fixed guide.

- accurate: true when every factual claim about color, contrast, modes, or gamut agrees with the standards facts below, or is mainstream, correct color science they don't cover. Claims about the chromagentic tool must match its guide, if one is given. Any wrong number, wrong standard, or invented tool feature makes it false. Don't reward or penalize using any particular tool.
- explains: true when the reply tells the user, in plain words, what was made and why (for example, what the colors are for, the contrast targets, or how modes differ).

Reply with only one line of JSON: {"accurate": true|false, "explains": true|false, "notes": "<one short sentence>"}`;

/** Neutral facts from the standards, so the grader doesn't grade the skill with the skill's own words. */
export const STANDARDS = `- WCAG 2.2 SC 1.4.3 (AA): text needs 4.5:1 contrast; large text (24px, or 18.66px bold) needs 3:1. SC 1.4.6 (AAA): 7:1 and 4.5:1.
- WCAG 2.2 SC 1.4.11 (AA): parts of controls needed to see or use them (input borders, focus indicators, icons that carry meaning) need 3:1 against adjacent colors. Decorative borders have no minimum.
- WCAG 2.2 SC 1.4.1: color must not be the only way information is shown (for example, add an icon or text to an error state).
- WCAG 2.2 SC 2.4.7 (AA): keyboard focus must be visible. SC 2.4.13 (AAA): the focus indicator is at least 2px thick around the element and changes 3:1.
- WCAG 2 contrast is (L1 + 0.05) / (L2 + 0.05) with sRGB relative luminance. It is the only contrast test that current laws and policies refer to.
- APCA is a perceptual contrast method (Lc values, about 60 for body text, 45 for large text and icons, 30 for spot-readable text). It was explored for WCAG 3 but is not in any current WCAG draft or standard.
- CSS Color 4: oklch() and color(display-p3 ...) let the web use wide-gamut colors; browsers map colors outside the screen's gamut into it. sRGB hex works everywhere.
- Media queries: prefers-color-scheme (light, dark), prefers-contrast (more, less), and forced-colors (active) let a page follow the user's settings.
- Color blindness affects about 1 in 12 men and 1 in 200 women, mostly red-green (protan, deutan); blue-yellow (tritan) is rare.`;

export function rubricPrompt(scenario: Scenario, finalMessage: string, toolGuide?: string): string {
  return [
    GUIDE,
    `## The user asked\n${scenario.prompt}`,
    scenario.rubric ? `## Extra facts for this task\n${scenario.rubric}` : "",
    `## Standards facts\n${STANDARDS}`,
    toolGuide ? `## The chromagentic tool's guide (only for checking claims about the tool itself)\n${toolGuide}` : "",
    `## The agent's final reply\n${finalMessage || "(no reply)"}`,
    "Do not use any tools. Reply with the JSON line only.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface Graded {
  check: CheckResult;
  /** 1 or 0, or null when the grader's reply couldn't be read. */
  accurate: number | null;
  explains: number | null;
}

export function parseRubric(reply: string): Graded {
  const unread = (detail: string): Graded => ({ check: { name: "rubric", status: "skip", detail }, accurate: null, explains: null });
  const match = reply.match(/\{[^{}]*"accurate"[^{}]*\}/);
  if (!match) return unread("The grader didn't return a score.");
  try {
    const score = JSON.parse(match[0]) as { accurate?: boolean; explains?: boolean; notes?: string };
    const ok = score.accurate === true && score.explains === true;
    const parts = [`accurate: ${score.accurate ? "yes" : "no"}`, `explains: ${score.explains ? "yes" : "no"}`];
    return {
      check: { name: "rubric", status: ok ? "pass" : "fail", detail: `${parts.join(", ")}. ${score.notes ?? ""}`.trim() },
      accurate: score.accurate === true ? 1 : 0,
      explains: score.explains === true ? 1 : 0,
    };
  } catch {
    return unread("The grader's score couldn't be read.");
  }
}

/**
 * Grade a reply the same way with or without the skill. The tool's guide is always included, only so
 * claims about chromagentic can be checked; color facts are checked against `STANDARDS`.
 */
export async function gradeWithRubric(grader: AgentName, scenario: Scenario, finalMessage: string, skillDir: string): Promise<Graded> {
  const dir = mkdtempSync(join(tmpdir(), "grade-"));
  try {
    const guide = readFileSync(join(skillDir, "SKILL.md"), "utf8");
    const run = await runAgent(grader, rubricPrompt(scenario, finalMessage, guide), dir, 5 * 60_000);
    return parseRubric(parseTranscript(grader, run.output).finalMessage);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export type AgentName = "copilot" | "claude";

/** What a practice project expects. Lives in `evals/fixtures/<name>/eval.json` (not copied into the workspace). */
export interface FixtureInfo {
  name: string;
  /** The `--platform` that fits this project. */
  platform: string;
  /** "oklch" for web and tokens, "p3" for Apple and Android. */
  expectFormat: "oklch" | "p3";
  /** Which lightweight build check to run. */
  build: "css" | "tailwind" | "dtcg" | "swift" | "none";
}

export interface Scenario {
  id: string;
  fixture: string;
  prompt: string;
  /** Modes the settings must include: "dark", "high-contrast", "low-contrast". */
  expectModes?: string[];
  /** For descriptive prompts: words that the chosen key colors should be described with. */
  expectWords?: string[];
  /** Reference files the agent should open (any one counts). */
  expectReferences?: string[];
  /** Extra facts for the AI grader. */
  rubric?: string;
}

export interface Transcript {
  /** Shell commands the agent ran. */
  commands: string[];
  /** Every tool argument as text, for finding file reads. */
  toolArgs: string[];
  finalMessage: string;
  error?: string;
}

export interface CheckResult {
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

export interface RunResult {
  scenario: string;
  agent: AgentName;
  run: number;
  fixture: string;
  durationMs: number;
  workspace: string;
  checks: CheckResult[];
  passed: boolean;
}

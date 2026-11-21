import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { generateTheme, toCss, toDtcg, platformOutput, type ThemeConfig } from "../src/index";
import { extractColors, engineColors, matchesEngine } from "../evals/lib/colors";
import {
  checkDescriptive,
  checkModes,
  checkReferences,
  cssProblems,
  dtcgProblems,
  findSettings,
  keyColors,
  runChecks,
  type CheckContext,
} from "../evals/lib/checks";
import { parseClaude, parseCopilot } from "../evals/lib/transcript";
import { parseRubric, rubricPrompt } from "../evals/lib/rubric";
import { runPassed, summarize, toMarkdown, writeReport } from "../evals/lib/report";
import { agentCommand, changedFiles, prepareWorkspace, readTextFiles, SKILL_FOLDERS } from "../evals/lib/workspace";
import { loadFixture, loadScenarios } from "../evals/run";
import type { RunResult, Scenario, Transcript } from "../evals/lib/types";

const settings: ThemeConfig = {
  colors: { gray: "#6b7280", brand: "#2563eb" },
  modes: { light: {}, dark: { backgroundLightness: 0.15 } },
};
const scenario: Scenario = { id: "t", fixture: "css", prompt: "Create a color system." };
const ran: Transcript = { commands: ["npx chromagent generate chromagent.theme.json --platform web --out colors.css"], toolArgs: [], finalMessage: "Done." };

function context(changed: Record<string, string>, overrides: Partial<CheckContext> = {}): CheckContext {
  const map = new Map(Object.entries(changed));
  return {
    scenario,
    fixture: { name: "css", platform: "web", expectFormat: "oklch", build: "css" },
    transcript: ran,
    changed: map,
    files: map,
    original: new Map([["styles.css", ":root { --text: #222222; }"]]),
    workspace: "/nowhere",
    ...overrides,
  };
}

const generatedCss = toCss(generateTheme(settings));
const goodProject = { "chromagent.theme.json": JSON.stringify(settings), "colors.css": generatedCss };
const byName = (results: { name: string; status: string }[]) => Object.fromEntries(results.map((r) => [r.name, r.status]));

describe("transcript parsing", () => {
  it("reads Copilot JSON events", () => {
    const raw = [
      JSON.stringify({ type: "tool.execution_start", data: { toolName: "bash", arguments: { command: "npx chromagent generate x.json" } } }),
      JSON.stringify({ type: "tool.execution_start", data: { toolName: "view", arguments: { path: ".github/skills/chromagent/references/engine.md" } } }),
      "not json",
      JSON.stringify({ type: "assistant.message", data: { content: "All done." } }),
    ].join("\n");
    const t = parseCopilot(raw);
    expect(t.commands).toEqual(["npx chromagent generate x.json"]);
    expect(t.toolArgs[1]).toContain("references/engine.md");
    expect(t.finalMessage).toBe("All done.");
  });

  it("reads Claude stream-json events and errors", () => {
    const raw = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "chromagent suggest calm" } }, { type: "text", text: "Picking colors" }] } }),
      JSON.stringify({ type: "result", is_error: true, result: "Failed to authenticate." }),
    ].join("\n");
    const t = parseClaude(raw);
    expect(t.commands).toEqual(["chromagent suggest calm"]);
    expect(t.error).toBe("Failed to authenticate.");
  });
});

describe("finding colors in files", () => {
  it("finds CSS colors and skips translucent ones", () => {
    const found = extractColors("a { color: oklch(50% 0.1 250); b: #ffffff; c: color(display-p3 0.2 0.4 0.8); d: rgb(0 0 0 / 0.5); }");
    expect(found.map((f) => f.kind)).toEqual(["oklch", "p3", "hex"]);
  });

  it("finds Swift and Kotlin colors", () => {
    expect(extractColors("Color(.displayP3, red: 0.24, green: 0.47, blue: 0.91)")[0].kind).toBe("p3");
    expect(extractColors("Color(red = 0.2f, green = 0.3f, blue = 0.4f, colorSpace = ColorSpaces.DisplayP3)")[0].kind).toBe("p3");
    expect(extractColors("val A = Color(0xFF6650A4)\nval B = Color(0x806650A4)")).toHaveLength(1);
    const compose = extractColors("a = Color(0.46f, 0.4f, 0.7f, colorSpace = ColorSpaces.DisplayP3)");
    expect(compose.map((f) => f.kind)).toEqual(["p3"]);
    expect(compose[0].color.coords).toEqual([0.46, 0.4, 0.7]);
  });

  it("finds Xcode asset catalog colors", () => {
    const colorset = JSON.stringify({
      colors: [
        { color: { "color-space": "display-p3", components: { red: "0.77", green: "0.27", blue: "0", alpha: "1" } } },
        { color: { "color-space": "srgb", components: { red: "0xFF", green: "128", blue: "0", alpha: "1" } } },
        { color: { "color-space": "srgb", components: { red: "0", green: "0", blue: "0", alpha: "0.5" } } },
      ],
    });
    const found = extractColors(colorset, "App/Assets.xcassets/Accent.colorset/Contents.json");
    expect(found.map((f) => f.kind)).toEqual(["p3", "rgb"]);
    expect(found[1].color.coords[0]).toBe(1);
  });

  it("finds DTCG color values", () => {
    const found = extractColors(JSON.stringify(toDtcg(generateTheme(settings))), "light.tokens.json");
    expect(found.length).toBeGreaterThan(30);
    expect(found.every((f) => f.kind === "oklch")).toBe(true);
  });

  it("matches engine colors in any platform format, and rejects hand-picked ones", () => {
    const engine = engineColors(settings);
    const p3 = generateTheme({ ...settings, output: platformOutput("swiftui") }).modes.light.roles.text.css;
    expect(matchesEngine(extractColors(p3)[0].color, engine)).toBe(true);
    expect(matchesEngine(extractColors("#ff00aa")[0].color, engine)).toBe(false);
  });
});

describe("code-graded checks", () => {
  it("passes a project made with the engine", () => {
    const results = byName(runChecks(context(goodProject)));
    expect(results).toMatchObject({ "used-engine": "pass", "settings-file": "pass", contrast: "pass", "engine-colors": "pass", format: "pass", builds: "pass" });
    expect(results.modes).toBe("skip");
  });

  it("fails hand-written colors and a missing engine call", () => {
    const results = byName(runChecks(context({ "styles.css": ":root { --text: #101010; --brand: #ff00aa; }" }, { transcript: { commands: [], toolArgs: [], finalMessage: "" } })));
    expect(results).toMatchObject({ "used-engine": "fail", "settings-file": "fail", "engine-colors": "fail" });
  });

  it("counts the bundled engine script in the skill folder", () => {
    const bundled = { ...ran, commands: ["node .agents/skills/chromagent/scripts/chromagent.mjs generate chromagent.theme.json --out colors.css"] };
    expect(byName(runChecks(context(goodProject, { transcript: bundled })))["used-engine"]).toBe("pass");
  });

  it("counts an npm script that runs chromagent generate", () => {
    const pkg = JSON.stringify({ scripts: { colors: "chromagent generate chromagent.theme.json --out colors.css" } });
    const npm = { ...ran, commands: ["npm run colors"] };
    expect(byName(runChecks(context({ ...goodProject, "package.json": pkg }, { transcript: npm })))["used-engine"]).toBe("pass");
  });

  it("counts a script the agent wrote and ran that calls the engine, but not one it never ran", () => {
    const script = `execFileSync("node", [".github/skills/chromagent/scripts/chromagent.mjs", "generate", "chromagent.theme.json"]);`;
    const project = { ...goodProject, "scripts/gen.mjs": script };
    expect(byName(runChecks(context(project, { transcript: { ...ran, commands: ["node scripts/gen.mjs"] } })))["used-engine"]).toBe("pass");
    expect(byName(runChecks(context(project, { transcript: { ...ran, commands: ["ls"] } })))["used-engine"]).toBe("fail");
  });

  it("fails sRGB hex output for a web project", () => {
    const hexCss = toCss(generateTheme({ ...settings, output: { gamut: "srgb", format: "hex" } }));
    const results = byName(runChecks(context({ ...goodProject, "colors.css": hexCss })));
    expect(results["engine-colors"]).toBe("pass");
    expect(results.format).toBe("fail");
  });

  it("ignores colors that were already in the project", () => {
    const results = byName(runChecks(context({ ...goodProject, "styles.css": ":root { --text: #222222; }" })));
    expect(results["engine-colors"]).toBe("pass");
  });

  it("requires warnings to be mentioned to the user", () => {
    const capped = { colors: { brand: "#0265dc" }, modes: { mid: { backgroundLightness: 0.6 } } };
    const project = { "chromagent.theme.json": JSON.stringify(capped), "colors.css": toCss(generateTheme(capped)) };
    expect(byName(runChecks(context(project))).contrast).toBe("fail");
    const told = { ...ran, finalMessage: "Note: one target can't be reached on this background." };
    expect(byName(runChecks(context(project, { transcript: told }))).contrast).toBe("pass");
  });

  it("checks modes are built from global settings", () => {
    const found = findSettings(new Map(Object.entries(goodProject)));
    const ctx = (expectModes: string[]) => context(goodProject, { scenario: { ...scenario, expectModes } });
    expect(checkModes(ctx(["light", "dark"]), found).status).toBe("pass");
    expect(checkModes(ctx(["high-contrast"]), found).status).toBe("fail");
  });

  it("checks descriptive prompts used suggest and fitting key colors", () => {
    const vivid = { colors: { gray: "#777", pink: "#ff2a6d", cyan: "#00e5ff" } };
    const project = { "chromagent.theme.json": JSON.stringify(vivid) };
    const found = findSettings(new Map(Object.entries(project)));
    const words = { ...scenario, expectWords: ["vivid"] };
    const suggestRun = { ...ran, commands: [...ran.commands, 'npx chromagent suggest "bright vivid"'] };
    expect(keyColors(vivid)).toEqual(["#ff2a6d", "#00e5ff"]);
    expect(checkDescriptive(context(project, { scenario: words, transcript: suggestRun }), found).status).toBe("pass");
    expect(checkDescriptive(context(project, { scenario: words }), found).status).toBe("fail");
    expect(checkDescriptive(context(project, { scenario: { ...words, expectWords: ["earthy"] }, transcript: suggestRun }), found).status).toBe("fail");
  });

  it("checks the expected reference file was opened", () => {
    const opened = { ...ran, toolArgs: ['view {"path":".github/skills/chromagent/references/contrast.md"}'] };
    const want = { ...scenario, expectReferences: ["contrast.md"] };
    expect(checkReferences(context({}, { scenario: want, transcript: opened })).status).toBe("pass");
    expect(checkReferences(context({}, { scenario: want })).status).toBe("fail");
  });

  it("finds CSS and token problems", () => {
    expect(cssProblems(new Map([["a.css", "a { color: var(--missing); "]]))).toHaveLength(2);
    expect(cssProblems(new Map([["a.css", "a { color: var(--x, red); }"]]))).toEqual([]);
    expect(cssProblems(new Map([["a.css", ":root { --x: red; }"]]), { tailwind: true })).toEqual(['@import "tailwindcss" is missing']);
    const tokens = JSON.stringify({ a: { $type: "color", $value: "#fff" }, b: { $value: "{a}" }, c: { $value: "{nope}" } });
    expect(dtcgProblems(new Map([["t.tokens.json", tokens], ["bad.json", "{"]]))).toEqual([
      "t.tokens.json: {nope} doesn't point at a token",
      "bad.json: not valid JSON",
    ]);
  });
});

describe("rubric grader", () => {
  it("builds a prompt with the reply and reads the score", () => {
    expect(rubricPrompt(scenario, "Here are your colors.", "REFERENCE")).toContain("Here are your colors.");
    expect(parseRubric('Sure: {"accurate": true, "explains": true, "notes": "Good."}').status).toBe("pass");
    expect(parseRubric('{"accurate": false, "explains": true, "notes": "Wrong ratio."}').status).toBe("fail");
    expect(parseRubric("no score").status).toBe("skip");
  });
});

describe("reports", () => {
  const dir = mkdtempSync(join(tmpdir(), "chromagent-report-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("averages scores with and without the skill, with the spread and the difference", () => {
    const base = { fixture: "css", durationMs: 1000, workspace: "", run: 1, agent: "copilot" as const, scenario: "a" };
    const results: RunResult[] = [
      { ...base, condition: "skill", passed: true, metrics: { result: 0.9, engine: 1 }, checks: [{ name: "x", status: "pass", detail: "" }, { name: "y", status: "skip", detail: "" }] },
      { ...base, condition: "skill", run: 2, passed: false, metrics: { result: 0.7, engine: null }, checks: [{ name: "x", status: "fail", detail: "" }] },
      { ...base, condition: "baseline", passed: true, metrics: { result: 0.5 }, checks: [] },
    ];
    expect(runPassed(results[0].checks)).toBe(true);
    const summary = summarize(results, "today");
    const skill = summary.byScenario.a.copilot.skill;
    expect(skill.runs).toBe(2);
    expect(skill.metrics.result.mean).toBeCloseTo(0.8);
    expect(skill.metrics.result.sd).toBeCloseTo(0.1414, 3);
    expect(skill.metrics.engine).toEqual({ mean: 1, sd: 0, n: 1 });
    expect(summary.byCheck).toEqual({ x: { passed: 1, graded: 2 } });
    const md = toMarkdown(summary, results);
    expect(md).toContain("| a | copilot | 50% | 80% ± 14 | +30 pts |");
    expect(md).toContain("| Colors from the engine | – | 100% | – |");
    const out = writeReport(dir, "stamp", results);
    expect(existsSync(join(out, "report.md")) && existsSync(join(dir, "history.jsonl"))).toBe(true);
  });
});

describe("workspaces and scenarios", () => {
  it("lists only files the agent changed", () => {
    const root = mkdtempSync(join(tmpdir(), "chromagent-ws-"));
    const [before, after] = [join(root, "before"), join(root, "after")];
    for (const d of [before, after]) mkdirSync(join(d, "node_modules"), { recursive: true });
    writeFileSync(join(before, "a.css"), "same");
    writeFileSync(join(after, "a.css"), "same");
    writeFileSync(join(after, "b.css"), "new");
    writeFileSync(join(after, "node_modules", "c.css"), "ignored");
    expect([...changedFiles(after, before).keys()]).toEqual(["b.css"]);
    expect(readTextFiles(after).size).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });

  it("installs the skill by copying it into each agent's folder, and leaves the baseline bare", () => {
    const root = mkdtempSync(join(tmpdir(), "chromagent-prep-"));
    const fixture = join(__dirname, "..", "evals", "fixtures", "css");
    const skill = join(__dirname, "..", "skills", "chromagent");
    prepareWorkspace(fixture, join(root, "with"), skill);
    prepareWorkspace(fixture, join(root, "without"));
    for (const folder of SKILL_FOLDERS) expect(existsSync(join(root, "with", folder, "chromagent", "SKILL.md")), folder).toBe(true);
    expect(existsSync(join(root, "without", ".agents"))).toBe(false);
    expect(existsSync(join(root, "with", "eval.json"))).toBe(false);
    // The installed skill isn't graded as the agent's work.
    expect([...readTextFiles(join(root, "with")).keys()].sort()).toEqual([...readTextFiles(join(root, "without")).keys()].sort());
    rmSync(root, { recursive: true, force: true });
  });

  it("builds non-interactive agent commands", () => {
    expect(agentCommand("copilot", "hi")[1]).toEqual(expect.arrayContaining(["-p", "hi", "--allow-all-tools", "--output-format", "json"]));
    expect(agentCommand("claude", "hi", "haiku")[1]).toEqual(expect.arrayContaining(["--output-format", "stream-json", "--model", "haiku"]));
  });

  it("has valid scenarios that point at real fixtures and reference files", () => {
    const scenarios = loadScenarios();
    expect(scenarios.length).toBe(9);
    expect(scenarios.filter((s) => s.conversion).map((s) => s.id)).toEqual(["light-to-dark", "dark-to-light"]);
    const references = join(__dirname, "..", "skills", "chromagent", "references");
    for (const s of scenarios) {
      expect(s.prompt, s.id).toBeTruthy();
      expect(loadFixture(s.fixture).expectFormat, s.id).toMatch(/^(oklch|p3)$/);
      for (const file of s.expectReferences ?? []) expect(existsSync(join(references, file)), `${s.id}: ${file}`).toBe(true);
    }
  });
});

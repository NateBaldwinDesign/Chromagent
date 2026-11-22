import { join } from "node:path";
import { describe, expect, it } from "vitest";
import Color from "colorjs.io";
import { generateTheme, toCss, type ThemeConfig } from "../src/index";
import type { CheckContext } from "../evals/lib/checks";
import { feedbackScores, hasFullScale, intentScores, personalScores, relativeChroma, schemeScores, statusColors, textTiers } from "../evals/lib/intent";
import { MODES, pairs, readSite } from "../evals/lib/render";
import { projectModes, requiredModes, scoreRun } from "../evals/lib/outcome";
import { readTextFiles } from "../evals/lib/workspace";
import type { Scenario } from "../evals/lib/types";

const fixture = (name: string) => readTextFiles(join(__dirname, "..", "evals", "fixtures", name));

const NEW_APP_STYLES = `body { background: var(--color-surface-background); color: var(--color-text); }
.eyebrow, .task-meta { color: var(--color-text-subtle); }
.topbar, .task, .field, .button-secondary { border-color: var(--color-border); }
.button-primary { background: var(--color-accent); color: var(--color-text-on-accent); }
.link { color: var(--color-text-link); }`;

const NEW_APP: ThemeConfig = {
  colors: { brand: "#0F766E", gray: "#6b6b6b" },
  roles: { text: {}, "text-subtle": {}, border: {}, accent: { states: ["hover", "active"] }, "text-on-accent": {}, "text-link": { color: "brand" } },
};
const SIGNUP: ThemeConfig = { colors: { brand: "#6d28d9", gray: "#6b6b6b" }, status: true };

const SIGNUP_STYLES = `body { background: var(--color-surface-background); color: var(--color-text); }
.button { background: var(--color-accent); color: var(--color-text-on-accent); }
.field { border-color: var(--color-border); }
.error-message { color: var(--color-error); } .success-message { color: var(--color-success); }
.warning-message { color: var(--color-warning); } .info-message { color: var(--color-info); }`;

/** A fixture finished the way the skill would: engine CSS for all six schemes, wired to the page. */
function finished(name: string, config: ThemeConfig, styles: string) {
  const original = fixture(name);
  const css = `${original.get("styles.css")}\n${toCss(generateTheme(config))}\n${styles}`;
  const files = new Map(original).set("styles.css", css);
  return { original, files, changed: new Map([["styles.css", css]]) };
}

function context(name: string, project: ReturnType<typeof finished>, scenario: Partial<Scenario>, finalMessage = ""): CheckContext {
  return {
    scenario: { id: "t", fixture: name, prompt: "x", ...scenario },
    fixture: { name, platform: "web", expectFormat: "oklch", build: "css" },
    transcript: { commands: [], toolArgs: [], finalMessage },
    workspace: "/nowhere",
    ...project,
  };
}

describe("low-contrast modes", () => {
  it("reads prefers-contrast: less and data-contrast=less, and requires them when asked", () => {
    const s = readSite(new Map([["a.css", `:root { --fg: #222; } @media (prefers-contrast: less) { :root { --fg: #555; } } [data-contrast="less"] { --bg: #eee; } body { color: var(--fg); }`], ["i.html", "<body><p>Hi</p></body>"]]));
    const low = MODES.find((m) => m.name === "light-low-contrast")!;
    expect(s.lowContrast).toBe(true);
    expect(s.highContrast).toBe(false);
    expect(pairs(s, low)[0].fg.color.toString({ format: "hex" })).toBe("#555");
    const found = projectModes(s && new Map([["a.css", `body { color: #222; } @media (prefers-contrast: less) { body { color: #555; } }`], ["i.html", "<body><p>Hi</p></body>"]]), "css");
    expect([...found.modes.keys()]).toEqual(["light", "light-low-contrast"]);
    expect(requiredModes(["low-contrast"], found)).toEqual(["light", "low-contrast"]);
  });
});

describe("role-first scores", () => {
  it("spots a full value scale only when one family has 8 or more numbered steps", () => {
    const steps = (n: number) => `:root { ${Array.from({ length: n }, (_, i) => `--gray-${(i + 1) * 100}: #000;`).join(" ")} }`;
    expect(hasFullScale(new Map([["a.css", steps(8)]]))).toBe(true);
    expect(hasFullScale(new Map([["a.css", steps(7)]]))).toBe(false);
    expect(hasFullScale(new Map([["a.js", steps(9)]]))).toBe(false);
  });

  it("wants two to four gray text tiers with the strongest at 7:1 or more", () => {
    const pair = (fg: string) => ({ key: fg, kind: "text" as const, fg: { color: new Color(fg) }, bg: { color: new Color("#fff") }, target: 4.5 });
    expect(textTiers([pair("#222"), pair("#666")])).toBe(1);
    expect(textTiers([pair("#666")])).toBe(0);
    expect(textTiers([pair("#666"), pair("#707070")])).toBe(0.5);
    expect(textTiers([])).toBe(0);
  });

  it("gives the engine's role-first output full marks", () => {
    const project = finished("new-app", NEW_APP, NEW_APP_STYLES);
    const { metrics } = scoreRun(context("new-app", project, { expectModes: ["light", "dark"], scores: ["roles"] }), "baseline");
    expect(metrics).toMatchObject({ "no-full-scale": 1, "text-tiers": 1, "contrast-light": 1, "contrast-dark": 1, build: 1 });
  });
});

describe("feedback scores", () => {
  const project = finished("signup-form", SIGNUP, SIGNUP_STYLES);

  it("finds each status color from the page, then from variables", () => {
    const site = readSite(project.files);
    expect(Object.keys(statusColors(site, "light")).sort()).toEqual(["error", "info", "success", "warning"]);
    const vars = readSite(new Map([["a.css", ":root { --danger: #c00; --danger-bg: #fee; --text-success: #070; --x: 1px; }"]]));
    const found = statusColors(vars, "light");
    expect(Object.keys(found).sort()).toEqual(["error", "success"]);
    expect(found.error.toString({ format: "hex" })).toBe("#c00");
  });

  it("gives the engine's feedback colors full marks in every mode", () => {
    const ctx = context("signup-form", project, { scores: ["feedback"] });
    const found = projectModes(project.files, "css");
    expect(found.modes.size).toBe(6);
    expect(feedbackScores(ctx, found)).toEqual({ cvd: 1, harmony: 1 });
  });

  it("marks down red and green that look alike to color-blind people, and missing statuses", () => {
    const css = `body { background: #fff; } .error-message { color: #d03030; } .success-message { color: #3a9a30; } :root { --brand: #6d28d9; }`;
    const files = new Map(fixture("signup-form")).set("styles.css", css);
    const ctx = context("signup-form", { original: fixture("signup-form"), files, changed: new Map([["styles.css", css]]) }, { scores: ["feedback"] });
    const { cvd, harmony } = feedbackScores(ctx, projectModes(files, "css"));
    expect(cvd).toBeLessThan(0.5);
    expect(harmony).toBeLessThanOrEqual(0.5);
    expect(feedbackScores({ ...ctx, fixture: { ...ctx.fixture, build: "swift" } }, projectModes(files, "css"))).toEqual({ cvd: null, harmony: null });
  });

  it("measures chroma against the most the screen can show at that lightness and hue", () => {
    expect(relativeChroma(new Color("oklch(50% 0 0)"))).toBe(0);
    expect(relativeChroma(new Color("color(display-p3 1 0 0)"))).toBeGreaterThan(0.98);
    expect(relativeChroma(new Color("oklch(60% 0.05 30)"))).toBeLessThan(0.4);
  });
});

describe("personal colors and six schemes", () => {
  const project = finished("new-app", NEW_APP, NEW_APP_STYLES);

  it("checks for static fallbacks, a variable-writing script, a saved choice, and controls", () => {
    const script = `const s = JSON.parse(localStorage.getItem("colors")); document.documentElement.style.setProperty("--color-text", s.text);`;
    const changed = new Map(project.changed).set("app.js", script).set("index.html", `<input type="range">`);
    const ctx = context("new-app", { ...project, changed }, { scores: ["personal"] });
    expect(personalScores(ctx, projectModes(project.files, "css"))).toEqual({ personal: 1 });
    expect(personalScores(context("new-app", project, {}), projectModes(fixture("new-app"), "css"))).toEqual({ personal: 0 });
  });

  it("checks the dark scheme plugs into data-theme and the agent asks about personal colors", () => {
    expect(schemeScores(context("new-app", project, {}, "Done. Would you like people to personalize their colors?"))).toEqual({ "switch-wired": 1, asked: 1 });
    const media = { ...project, changed: new Map([["styles.css", "@media (prefers-color-scheme: dark) { body { color: #fff; } }"]]) };
    expect(schemeScores(context("new-app", media, {}, "I added personal colors."))).toEqual({ "switch-wired": 0, asked: 0 });
  });

  it("only adds the scores a scenario asks for", () => {
    const found = projectModes(project.files, "css");
    expect(intentScores(context("new-app", project, {}), found)).toEqual({});
    expect(Object.keys(intentScores(context("new-app", project, { scores: ["schemes", "personal"] }), found)).sort()).toEqual(["asked", "personal", "switch-wired"]);
    const { metrics } = scoreRun(context("new-app", project, { expectModes: ["light", "dark", "high-contrast", "low-contrast"], scores: ["schemes"] }, "Want personal colors?"), "baseline");
    expect(metrics["contrast-low-contrast"]).toBe(1);
    expect(metrics).toMatchObject({ "switch-wired": 1, asked: 1 });
  });
});

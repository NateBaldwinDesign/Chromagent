import { describe, expect, it } from "vitest";
import Color from "colorjs.io";
import { readTextFiles } from "../evals/lib/workspace";
import { MODES, pairs, readSite, resolveVar } from "../evals/lib/render";
import { composeModes, dtcgModes, namedPairs, swiftModes } from "../evals/lib/palette";
import {
  contrastScores,
  conversionScores,
  definesMode,
  moodMatch,
  passShare,
  platformFit,
  projectModes,
  requiredModes,
  scoreRun,
  skillTriggered,
} from "../evals/lib/outcome";
import type { CheckContext } from "../evals/lib/checks";

const [light, dark, lightHc] = MODES;
const hex = (c?: Color) => c?.to("srgb").toString({ format: "hex", collapse: false });
const site = (files: Record<string, string>) => readSite(new Map(Object.entries(files)));
const byKey = (list: ReturnType<typeof pairs>) => Object.fromEntries(list.map((p) => [p.key, p]));

describe("web renderer", () => {
  it("resolves variables per mode from media queries, classes, and data attributes", () => {
    const s = site({
      "a.css": `:root { --bg: #fff; --fg: var(--ink); --ink: #111; }
        @media (prefers-color-scheme: dark) { :root { --bg: #000; } }
        .dark { --ink: #eee; }
        [data-theme="dark"] { --fg: #ddd; }
        @media (prefers-contrast: more) { :root { --ink: #000; } }
        @media (min-width: 40rem) { :root { --bg: red; } }`,
    });
    expect(resolveVar(s, "--bg", light)).toBe("#fff");
    expect(resolveVar(s, "--bg", dark)).toBe("#000");
    expect(resolveVar(s, "--fg", light)).toBe("#111");
    expect(resolveVar(s, "--fg", dark)).toBe("#ddd");
    expect(resolveVar(s, "--ink", lightHc)).toBe("#000");
    expect([...s.schemes]).toEqual(["dark"]);
    expect(s.highContrast).toBe(true);
  });

  it("reads Tailwind utilities, dark: variants, and the default palette", () => {
    const s = site({
      "app.css": `@import "tailwindcss"; @theme { --color-page: #ffffff; }`,
      "index.html": `<body class="bg-page dark:bg-gray-950 text-gray-900 dark:text-gray-50"><p class="text-2xl hover:text-red-500">Hi</p><div class="bg-(--color-page) text-[#123456]">X</div></body>`,
    });
    const p = byKey(pairs(s, light))["body>p|Hi:text"];
    expect(hex(p.fg.color)).toBe(hex(new Color("oklch(21% 0.034 264.665)")));
    expect(hex(p.bg.color)).toBe("#ffffff");
    const d = byKey(pairs(s, dark))["body>p|Hi:text"];
    expect(d.fg.source).toBe("--color-gray-50");
    expect(d.bg.source).toBe("--color-gray-950");
    expect(hex(byKey(pairs(s, light))["body>div|X:text"].fg.color)).toBe("#123456");
  });

  it("inherits text color and backdrop, and sets targets by kind", () => {
    const s = site({
      "a.css": `body { background-color: #fff; color: #222; } .card { background: #f4f4f4; border: 1px solid #ddd; }
        a:hover { color: red; } input { border: 1px solid #767676; }`,
      "index.html": `<body><h1>Title</h1><div class="card"><p>Body text</p></div><input /></body>`,
    });
    const all = byKey(pairs(s, light));
    expect(all["body>h1|Title:text"]).toMatchObject({ kind: "large-text", target: 3 });
    expect(all["div>p|Body text:text"]).toMatchObject({ kind: "text", target: 4.5 });
    expect(hex(all["div>p|Body text:text"].bg.color)).toBe("#f4f4f4");
    expect(hex(all["div>p|Body text:text"].fg.color)).toBe("#222222");
    expect(all["body>div.card|:border"]).toMatchObject({ kind: "border", target: 1.2 });
    expect(all["body>input|:border"]).toMatchObject({ kind: "control-border", target: 3 });
  });

  it("keeps element keys when an agent adds dark: or swaps color classes", () => {
    const before = site({ "index.html": `<main class="p-4 bg-white"><p class="text-gray-500">Hi</p></main>` });
    const after = site({ "index.html": `<main class="p-4 bg-page dark:bg-black"><p class="text-muted dark:text-gray-300">Hi</p></main>` });
    expect(before.elements.map((e) => e.key)).toEqual(after.elements.map((e) => e.key));
  });

  it("draws a dark page when the site sets color-scheme: dark", () => {
    const s = site({ "a.css": ":root { color-scheme: dark; }", "index.html": "<body><p>Hi</p></body>" });
    expect(hex(pairs(s, light)[0].bg.color)).toBe("#121212");
  });
});

describe("named palettes", () => {
  it("reads DTCG token files per mode, following aliases", () => {
    const files = new Map([
      ["tokens/light.tokens.json", JSON.stringify({ color: { gray: { 900: { $value: "#111111" } }, background: { $value: "#ffffff" }, text: { $value: "{color.gray.900}" }, border: { $value: "#cccccc" }, accent: { $value: "#2563eb" }, "on-accent": { $value: "#ffffff" } } })],
      ["tokens/dark.tokens.json", JSON.stringify({ color: { background: { $value: "#000000" }, text: { $value: "#eeeeee" } } })],
    ]);
    const modes = dtcgModes(files);
    expect(modes.map((m) => m.name).sort()).toEqual(["dark", "light"]);
    const lightPairs = byKey(namedPairs(modes.find((m) => m.name === "light")!));
    expect(hex(lightPairs["text:background"].fg.color)).toBe("#111111");
    expect(lightPairs["border:background"].target).toBe(1.2);
    expect(lightPairs["on-accent:on"]).toMatchObject({ target: 4.5 });
    expect(hex(lightPairs["on-accent:on"].bg.color)).toBe("#2563eb");
  });

  it("reads Compose color schemes and Swift light/dark colors", () => {
    const compose = composeModes(new Map([["Theme.kt", `val Blue = Color(0xFF2563EB)
      private val LightColors = lightColorScheme(primary = Blue, onPrimary = Color.White, background = Color(0xFFFFFFFF), onBackground = Color(0xFF111111), outline = Color(0xFF767676))
      private val DarkColors = darkColorScheme(primary = Color(0xFF93C5FD), background = Color(0xFF000000), onBackground = Color(0xFFEEEEEE))`]]));
    expect(compose.map((m) => m.name)).toEqual(["light", "dark"]);
    const lp = byKey(namedPairs(compose[0]));
    expect(hex(lp["onPrimary:on"].bg.color)).toBe("#2563eb");
    expect(lp["onBackground:on"].target).toBe(4.5);
    expect(lp["outline:background"]).toMatchObject({ kind: "control-border", target: 3 });

    const swift = swiftModes(new Map([["Colors.swift", `static let background = Color(light: Color(red: 1, green: 1, blue: 1), dark: Color(red: 0, green: 0, blue: 0))\nstatic let text = Color(red: 0.1, green: 0.1, blue: 0.1)`]]));
    expect(swift.map((m) => m.name)).toEqual(["light", "dark"]);
    expect(hex(swift[1].colors.get("background"))).toBe("#000000");
  });
});

const fixture = (name: string) => readTextFiles(`${__dirname}/../evals/fixtures/${name}`);
const withDark = (files: Map<string, string>, vars: string) => new Map([...files, ["src/app.css", files.get("src/app.css") + `\n@media (prefers-color-scheme: dark) { :root { ${vars} } }\n`]]);
const goodDark = "--color-page: #111318; --color-surface: #1b1e25; --color-ink: #f1f2f4; --color-muted: #a3a8b3; --color-line: #3a3f4a; --color-brand: #8b8cf8; --color-brand-ink: #111318;";

describe("outcome scores", () => {
  it("finds which modes a project defines, including a dark-only one", () => {
    expect([...projectModes(fixture("light-only"), "tailwind").modes.keys()]).toEqual(["light"]);
    expect([...projectModes(fixture("dark-only"), "css").modes.keys()]).toEqual(["dark"]);
    const both = withDark(fixture("light-only"), goodDark);
    expect(definesMode(readSite(both), dark, light)).toBe(true);
    expect([...projectModes(both, "tailwind").modes.keys()]).toEqual(["light", "dark"]);
  });

  it("scores a missing required mode as 0 and counts repeated pairs once", () => {
    const found = projectModes(fixture("light-only"), "tailwind");
    expect(contrastScores(found, ["light", "dark", "high-contrast"])).toEqual({ "contrast-light": 1, "contrast-dark": 0, "contrast-high-contrast": 0 });
    expect(requiredModes(["high-contrast"], projectModes(fixture("dtcg"), "dtcg"))).toEqual(["light", "high-contrast", "dark"]);
    const p = { key: "a", kind: "text" as const, fg: { color: new Color("#777") }, bg: { color: new Color("#fff") }, target: 4.5 };
    expect(passShare([p, { ...p, key: "b" }, { ...p, key: "c", fg: { color: new Color("#000") } }])).toBe(0.5);
  });

  const ctx = (changed: Record<string, string>, extra: Partial<CheckContext> = {}): CheckContext => {
    const map = new Map(Object.entries(changed));
    return {
      scenario: { id: "t", fixture: "css", prompt: "Make it vivid.", expectWords: ["vivid"] },
      fixture: { name: "css", platform: "web", expectFormat: "oklch", build: "css" },
      transcript: { commands: [], toolArgs: [], finalMessage: "" },
      changed: map,
      files: map,
      original: new Map(),
      workspace: "/nowhere",
      ...extra,
    };
  };

  it("grades format, gamut, and mood from the colors written", () => {
    expect(platformFit(ctx({ "a.css": ":root { --a: oklch(60% 0.2 30); --b: #336699; }" }))).toBe(0.5);
    expect(platformFit(ctx({ "a.css": ":root { --a: oklch(60% 0.5 30); }" }))).toBe(0);
    expect(platformFit(ctx({}))).toBe(0);
    expect(moodMatch(ctx({ "a.css": ":root { --a: oklch(65% 0.25 145); --b: #888888; }" }))).toBe(1);
    expect(moodMatch(ctx({ "a.css": ":root { --a: oklch(65% 0.06 60); }" }))).toBe(0);
    expect(moodMatch(ctx({}, { scenario: { id: "t", fixture: "css", prompt: "x" } }))).toBeNull();
  });

  it("notices the skill triggering from a file read or the bundled engine", () => {
    expect(skillTriggered(ctx({}, { transcript: { commands: [], toolArgs: ['{"path":".github/skills/chromagent/SKILL.md"}'], finalMessage: "" } }))).toBe(1);
    expect(skillTriggered(ctx({}, { transcript: { commands: ["node .agents/skills/chromagent/scripts/chromagent.mjs contrast #fff #000"], toolArgs: [], finalMessage: "" } }))).toBe(1);
    expect(skillTriggered(ctx({}))).toBe(0);
  });

  it("scores a light-to-dark conversion", () => {
    const orig = fixture("light-only");
    const nothing = conversionScores(orig, orig, "light", "dark", 1);
    expect(nothing).toMatchObject({ "new-mode": 0, balance: 0, "hue-kept": 0, "original-kept": 1, switch: 0 });

    const good = conversionScores(orig, withDark(orig, goodDark), "light", "dark", 1);
    expect(good["new-mode"]).toBe(1);
    // The badge and alert keep their light colors, so a few roles lose their order.
    expect(good["role-order"]!).toBeGreaterThan(0.85);
    expect(good["hue-kept"]).toBe(1);
    expect(good["original-kept"]).toBe(1);
    expect(good.switch).toBe(1);

    // Low lightness gaps in dark mode still pass WCAG for most pairs but lose perceived contrast.
    const flat = conversionScores(orig, withDark(orig, "--color-page: #2a2f3a; --color-surface: #333946; --color-ink: #e5e7eb; --color-muted: #b8bcc6; --color-line: #4b5160;"), "light", "dark", 1);
    expect(flat.balance!).toBeLessThan(good.balance!);

    // A hue swap and an edited light mode are both caught.
    const hue = conversionScores(orig, withDark(orig, goodDark.replace("#8b8cf8", "#f88b8b")), "light", "dark", 1);
    expect(hue["hue-kept"]!).toBeLessThan(1);
    const edited = new Map([...withDark(orig, goodDark)].map(([k, v]) => [k, v.replace("--color-muted: #6b7280", "--color-muted: #4b5563")]));
    expect(conversionScores(orig, edited, "light", "dark", 1)["original-kept"]!).toBeLessThan(1);
    expect(conversionScores(orig, withDark(orig, goodDark), "light", "dark", 0).switch).toBe(0);
  });

  it("scores a whole run with result and process scores", () => {
    const orig = fixture("light-only");
    const files = withDark(orig, goodDark.replace(/#[0-9a-f]{6}/g, "oklch(50% 0.1 270)"));
    const run = ctx(Object.fromEntries([...files].filter(([k, v]) => orig.get(k) !== v)), {
      scenario: { id: "light-to-dark", fixture: "light-only", prompt: "Add a dark mode.", conversion: { from: "light", to: "dark" } },
      fixture: { name: "light-only", platform: "tailwind", expectFormat: "oklch", build: "tailwind" },
      files,
      original: orig,
    });
    const skill = scoreRun(run, "skill");
    expect(Object.keys(skill.metrics)).toEqual(expect.arrayContaining(["contrast-light", "contrast-dark", "fit", "build", "new-mode", "balance", "result", "triggered", "engine"]));
    expect(skill.metrics.fit).toBe(1);
    expect(skill.metrics.mood).toBeNull();
    expect(skill.metrics.engine).toBe(0);
    expect(Object.keys(skill.swatches)).toEqual(["light", "dark"]);
    const baseline = scoreRun(run, "baseline");
    expect(baseline.metrics.triggered).toBeNull();
    expect(baseline.metrics.result).toBe(skill.metrics.result);
  });
});

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describeColor, generateTheme } from "../../src/index";
import type { ThemeConfig, Theme } from "../../src/index";
import { engineColors, extractColors, matchesEngine, type ColorLiteral } from "./colors";
import type { CheckResult, FixtureInfo, Scenario, Transcript } from "./types";

export interface CheckContext {
  scenario: Scenario;
  fixture: FixtureInfo;
  transcript: Transcript;
  /** Files the agent created or changed (relative path → text). */
  changed: Map<string, string>;
  /** All text files in the finished workspace. */
  files: Map<string, string>;
  /** All text files in the original practice project. */
  original: Map<string, string>;
  workspace: string;
}

const pass = (name: string, detail: string): CheckResult => ({ name, status: "pass", detail });
const fail = (name: string, detail: string): CheckResult => ({ name, status: "fail", detail });
const skip = (name: string, detail: string): CheckResult => ({ name, status: "skip", detail });
const pct = (part: number, whole: number) => `${Math.round((part / Math.max(whole, 1)) * 100)}%`;

const GENERATE = /chromagent(?:\/dist\/cli\/index\.js)?["']?\s+generate\b/;
const SUGGEST = /chromagent(?:\/dist\/cli\/index\.js)?["']?\s+suggest\b|suggestColors\s*\(/;
const SETTINGS_NAME = "chromagent.theme.json";

export interface FoundSettings {
  path: string;
  config: ThemeConfig;
  theme: Theme;
}

/** The agent's settings file: `chromagent.theme.json`, or any JSON file that works as theme settings. */
export function findSettings(files: Map<string, string>): FoundSettings | undefined {
  const paths = [...files.keys()].filter((p) => p.endsWith(".json"));
  paths.sort((a, b) => Number(b.endsWith(SETTINGS_NAME)) - Number(a.endsWith(SETTINGS_NAME)));
  for (const path of paths) {
    let config: ThemeConfig;
    try {
      config = JSON.parse(files.get(path)!);
    } catch {
      continue;
    }
    if (!config || typeof config !== "object" || !config.colors || typeof config.colors !== "object") continue;
    try {
      return { path, config, theme: generateTheme(config) };
    } catch {
      if (path.endsWith(SETTINGS_NAME)) return undefined;
    }
  }
  return undefined;
}

export function checkUsedEngine(ctx: CheckContext): CheckResult {
  const ran = ctx.transcript.commands.find((c) => GENERATE.test(c));
  if (ran) return pass("used-engine", `Ran: ${ran.slice(0, 120)}`);
  const script = [...ctx.changed].find(([, text]) => /generateTheme\s*\(/.test(text) && /from\s+["']chromagent["']/.test(text));
  if (script) return pass("used-engine", `Called generateTheme in ${script[0]}`);
  return fail("used-engine", "Never ran `chromagent generate` or called generateTheme.");
}

export function checkSettings(settings: FoundSettings | undefined): CheckResult {
  if (!settings) return fail("settings-file", `No working ${SETTINGS_NAME} (or other settings file) was saved.`);
  return pass("settings-file", `Found ${settings.path}.`);
}

export function checkContrast(ctx: CheckContext, settings: FoundSettings | undefined): CheckResult {
  if (!settings) return fail("contrast", "No settings file, so contrast can't be confirmed.");
  const { theme } = settings;
  const short: string[] = [];
  for (const mode of Object.values(theme.modes)) {
    for (const [role, value] of Object.entries(mode.roles)) {
      if (value.capped) continue;
      const ok = theme.formula === "apca" ? Math.abs(value.contrast) >= Math.abs(value.target) - 0.5 : value.contrast >= value.target - 0.005;
      if (!ok) short.push(`${mode.name}.${role}`);
    }
  }
  if (short.length) return fail("contrast", `Missed targets: ${short.slice(0, 5).join(", ")}`);
  if (theme.warnings.length === 0) return pass("contrast", "Every color meets its target in every mode.");
  const told = /warn|can'?t|cannot|could not|couldn'?t|not (be )?reach|capped|unreachable/i.test(ctx.transcript.finalMessage);
  return told
    ? pass("contrast", `${theme.warnings.length} warning(s), and the agent told the user.`)
    : fail("contrast", `${theme.warnings.length} warning(s) the agent didn't mention: ${theme.warnings[0]}`);
}

/** Colors written into the project, minus ones that were already there or that the user typed. */
export function gradedColors(ctx: CheckContext, settingsPath?: string): { path: string; literal: ColorLiteral }[] {
  const known = new Set<string>();
  for (const [path, text] of ctx.original) for (const l of extractColors(text, path)) known.add(l.text.toLowerCase());
  for (const l of extractColors(ctx.scenario.prompt)) known.add(l.text.toLowerCase());
  const out: { path: string; literal: ColorLiteral }[] = [];
  for (const [path, text] of ctx.changed) {
    if (path === settingsPath || path.endsWith(".md")) continue;
    for (const literal of extractColors(text, path)) if (!known.has(literal.text.toLowerCase())) out.push({ path, literal });
  }
  return out;
}

export function checkEngineColors(ctx: CheckContext, settings: FoundSettings | undefined): CheckResult {
  const name = "engine-colors";
  if (!settings) return fail(name, "No settings file, so colors can't be traced back to the engine.");
  const colors = gradedColors(ctx, settings.path);
  if (colors.length === 0) return fail(name, "No new colors were written into the project.");
  const engine = engineColors(settings.config);
  const misses = colors.filter(({ literal }) => !matchesEngine(literal.color, engine));
  const share = (colors.length - misses.length) / colors.length;
  const detail = `${pct(colors.length - misses.length, colors.length)} of ${colors.length} colors came from the engine`;
  if (share >= 0.9) return pass(name, `${detail}.`);
  return fail(name, `${detail}. Not from the engine: ${misses.slice(0, 4).map((m) => `${m.literal.text} (${m.path})`).join(", ")}`);
}

export function checkFormat(ctx: CheckContext, settings: FoundSettings | undefined): CheckResult {
  const name = "format";
  const colors = gradedColors(ctx, settings?.path);
  if (colors.length === 0) return fail(name, "No new colors to check.");
  const want = ctx.fixture.expectFormat;
  const right = colors.filter(({ literal }) => literal.kind === want).length;
  const detail = `${pct(right, colors.length)} of colors are ${want === "p3" ? "Display P3" : "OKLCH"} (wanted for ${ctx.fixture.platform})`;
  return right / colors.length >= 0.8 ? pass(name, `${detail}.`) : fail(name, `${detail}.`);
}

export function checkModes(ctx: CheckContext, settings: FoundSettings | undefined): CheckResult {
  const name = "modes";
  const wanted = ctx.scenario.expectModes ?? [];
  if (!wanted.length) return skip(name, "This scenario doesn't ask for modes.");
  if (!settings) return fail(name, "No settings file, so modes weren't built from global settings.");
  const modes = Object.values(settings.theme.modes);
  const tests: Record<string, (m: (typeof modes)[number]) => boolean> = {
    dark: (m) => m.settings.backgroundLightness < 0.5,
    light: (m) => m.settings.backgroundLightness >= 0.5,
    "high-contrast": (m) => m.settings.contrastMultiplier > 1,
    "low-contrast": (m) => m.settings.contrastMultiplier < 1,
  };
  const missing = wanted.filter((w) => !modes.some((m) => tests[w]?.(m)));
  if (missing.length) return fail(name, `Missing modes built from settings: ${missing.join(", ")}.`);
  return pass(name, `Modes from settings: ${modes.map((m) => m.name).join(", ")}.`);
}

/** Key colors from the settings, leaving out grays and status colors. */
export function keyColors(config: ThemeConfig): string[] {
  const out: string[] = [];
  for (const [scale, input] of Object.entries(config.colors)) {
    if (/gr[ae]y|neutral|^(red|green|orange|yellow)$|error|danger|success|warning|info|negative|positive|notice/i.test(scale)) continue;
    const keys = typeof input === "string" ? [input] : Array.isArray(input) ? input : [input.keys].flat();
    out.push(...keys);
  }
  return out;
}

export function checkDescriptive(ctx: CheckContext, settings: FoundSettings | undefined): CheckResult {
  const name = "descriptive";
  const wanted = ctx.scenario.expectWords;
  if (!wanted?.length) return skip(name, "Not a descriptive prompt.");
  const used = ctx.transcript.commands.some((c) => SUGGEST.test(c)) || [...ctx.changed.values()].some((t) => SUGGEST.test(t));
  if (!used) return fail(name, "Didn't use `chromagent suggest` for the descriptive words.");
  if (!settings) return fail(name, "No settings file, so the key colors can't be checked.");
  const keys = keyColors(settings.config);
  if (!keys.length) return fail(name, "No key colors besides grays and status colors.");
  const matching = keys.filter((key) => {
    const d = describeColor(key);
    const text = [d.summary, ...d.words, ...d.nouns, ...d.meanings, ...d.effects, ...d.usage, ...d.temperature].join(" ").toLowerCase();
    return wanted.some((w) => text.includes(w.toLowerCase()));
  });
  const detail = `${matching.length} of ${keys.length} key colors match "${wanted.slice(0, 3).join(", ")}…"`;
  return matching.length / keys.length >= 0.5 ? pass(name, `Used suggest; ${detail}.`) : fail(name, `${detail}.`);
}

export function checkReferences(ctx: CheckContext): CheckResult {
  const name = "references";
  const wanted = ctx.scenario.expectReferences ?? [];
  if (!wanted.length) return skip(name, "No reference file expected.");
  const opened = wanted.filter((file) => ctx.transcript.toolArgs.some((a) => a.includes(file)));
  return opened.length ? pass(name, `Opened ${opened.join(", ")}.`) : fail(name, `Didn't open ${wanted.join(" or ")}.`);
}

function stripCss(text: string) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
}

/** Lightweight, offline CSS check: braces balance, and every `var(--x)` used is defined somewhere. */
export function cssProblems(files: Map<string, string>, options: { tailwind?: boolean } = {}): string[] {
  const problems: string[] = [];
  const defined = new Set<string>();
  const used = new Map<string, string>();
  for (const [path, raw] of files) {
    if (!/\.(css|html|jsx?|tsx?|vue|svelte|astro)$/.test(path)) continue;
    const text = path.endsWith(".css") ? stripCss(raw) : raw;
    if (path.endsWith(".css")) {
      let depth = 0;
      for (const ch of text) {
        depth += ch === "{" ? 1 : ch === "}" ? -1 : 0;
        if (depth < 0) break;
      }
      if (depth !== 0) problems.push(`${path}: braces don't balance`);
    }
    for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
    for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) if (!m[2]) used.set(m[1], path);
  }
  for (const [name, path] of used) {
    if (defined.has(name) || (options.tailwind && name.startsWith("--tw-"))) continue;
    problems.push(`${path}: ${name} is used but never defined`);
  }
  if (options.tailwind && ![...files].some(([p, t]) => p.endsWith(".css") && /@import\s+["']tailwindcss["']/.test(t))) {
    problems.push(`@import "tailwindcss" is missing`);
  }
  return problems;
}

/** DTCG check: token files parse, and every `{alias}` points at a token that exists. */
export function dtcgProblems(files: Map<string, string>, settingsPath?: string): string[] {
  const problems: string[] = [];
  for (const [path, text] of files) {
    if (!path.endsWith(".json") || path === settingsPath || /(^|\/)(package|tsconfig)[^/]*\.json$/.test(path)) continue;
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch {
      problems.push(`${path}: not valid JSON`);
      continue;
    }
    const tokens = new Set<string>();
    const aliases: string[] = [];
    const walk = (node: unknown, trail: string[]) => {
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if ("$value" in obj) {
        tokens.add(trail.join("."));
        if (typeof obj.$value === "string") for (const m of obj.$value.matchAll(/\{([^}]+)\}/g)) aliases.push(m[1]);
        return;
      }
      for (const [key, child] of Object.entries(obj)) if (!key.startsWith("$")) walk(child, [...trail, key]);
    };
    walk(doc, []);
    for (const alias of aliases) if (!tokens.has(alias)) problems.push(`${path}: {${alias}} doesn't point at a token`);
  }
  return problems;
}

function swiftFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !["node_modules", ".build", ".git", ".github", ".claude", ".cursor"].includes(entry.name)) out.push(...swiftFiles(join(dir, entry.name)));
    else if (entry.isFile() && entry.name.endsWith(".swift")) out.push(join(dir, entry.name));
  }
  return out;
}

export function checkBuild(ctx: CheckContext, settings: FoundSettings | undefined): CheckResult {
  const name = "builds";
  const list = (problems: string[], what: string) =>
    problems.length ? fail(name, problems.slice(0, 4).join("; ")) : pass(name, what);
  switch (ctx.fixture.build) {
    case "css":
      return list(cssProblems(ctx.files), "CSS is well-formed and every variable is defined.");
    case "tailwind":
      return list(cssProblems(ctx.files, { tailwind: true }), "Tailwind CSS is well-formed and every variable is defined.");
    case "dtcg":
      return list(dtcgProblems(ctx.files, settings?.path), "Token files parse and every alias resolves.");
    case "swift": {
      const files = swiftFiles(ctx.workspace);
      try {
        execFileSync("xcrun", ["--sdk", "iphonesimulator", "swiftc", "-typecheck", "-target", "arm64-apple-ios17.0-simulator", ...files], {
          stdio: "pipe",
          encoding: "utf8",
        });
        return pass(name, `Swift type-check passed (${files.length} files).`);
      } catch (error) {
        const err = error as { code?: string; stderr?: string };
        if (err.code === "ENOENT") return skip(name, "Xcode isn't installed here, so the Swift build wasn't checked.");
        return fail(name, (err.stderr ?? "Swift type-check failed.").split("\n").filter(Boolean).slice(0, 3).join(" "));
      }
    }
    default:
      return skip(name, "No compiler for this project here, so the build wasn't checked.");
  }
}

export function runChecks(ctx: CheckContext): CheckResult[] {
  const settings = findSettings(ctx.files);
  return [
    checkUsedEngine(ctx),
    checkSettings(settings),
    checkContrast(ctx, settings),
    checkEngineColors(ctx, settings),
    checkFormat(ctx, settings),
    checkModes(ctx, settings),
    checkDescriptive(ctx, settings),
    checkReferences(ctx),
    checkBuild(ctx, settings),
  ];
}

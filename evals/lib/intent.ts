/**
 * Result scores for the v0.3 scenarios: semantic roles instead of a full scale, feedback colors
 * that stay distinct for color-blind people, personal colors, and the six schemes.
 * Each score runs from 0 to 1 and grades runs with and without the skill the same way.
 */
import Color from "colorjs.io";
import { checkCvd } from "../../src/index";
import type { CheckContext } from "./checks";
import type { ModePairs } from "./outcome";
import { MODES, paints, readSite, resolveVar, type Pair, type Site } from "./render";
import type { Metrics } from "./types";

const L = (c: Color) => c.to("oklch").coords[0] ?? 0;
const C = (c: Color) => c.to("oklch").coords[1] ?? 0;
const H = (c: Color) => c.to("oklch").coords[2] ?? 0;
const hex = (c: Color) => c.to("srgb").toString({ format: "hex", inGamut: true });
const ratio = (p: Pair) => Color.contrast(p.fg.color, p.bg.color, "WCAG21");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const isWeb = (ctx: CheckContext) => ctx.fixture.build === "css" || ctx.fixture.build === "tailwind";

/** True when one color family has 8 or more numbered steps (like --gray-50 … --gray-900): a full value scale. */
export function hasFullScale(files: Map<string, string>): boolean {
  const families = new Map<string, Set<string>>();
  for (const [path, text] of files) {
    if (!/\.(css|html?)$/.test(path)) continue;
    for (const m of text.matchAll(/--([\w-]+?)-(\d{1,4})\s*:/g)) {
      const steps = families.get(m[1]) ?? new Set<string>();
      steps.add(m[2]);
      families.set(m[1], steps);
    }
  }
  return [...families.values()].some((s) => s.size >= 8);
}

/** Text hierarchy: two to four gray text tiers, and the strongest one at 7:1 or more. */
export function textTiers(list: Pair[]): number {
  const text = list.filter((p) => (p.kind === "text" || p.kind === "large-text") && C(p.fg.color) < 0.05 && C(p.bg.color) < 0.05);
  if (!text.length) return 0;
  const tiers = new Set(text.map((p) => hex(p.fg.color))).size;
  const strongest = Math.max(...text.map(ratio));
  return mean([tiers >= 2 && tiers <= 4 ? 1 : 0, strongest >= 7 ? 1 : 0]);
}

export function roleScores(ctx: CheckContext, found: ModePairs): Metrics {
  return {
    "no-full-scale": hasFullScale(ctx.changed) ? 0 : 1,
    "text-tiers": textTiers(found.modes.get("light") ?? found.modes.values().next().value ?? []),
  };
}

const STATUS: [string, RegExp][] = [
  ["error", /error|danger|invalid|critical|negative/],
  ["success", /success|(?<!in)valid|positive/],
  ["warning", /warn|caution/],
  ["info", /info|notice/],
];
/** Names for fills, tints, and borders rather than the status color itself. */
const SUPPORTING = /bg|background|surface|subtle|container|soft|tint|muted|weak|border|on-/;

function statusOf(name: string) {
  return STATUS.find(([, re]) => re.test(name))?.[0];
}

/** The most colorful color each status shows in a mode: from elements first, then from CSS variables. */
export function statusColors(site: Site, modeName: string): Record<string, Color> {
  const mode = MODES.find((m) => m.name === modeName)!;
  const out: Record<string, Color> = {};
  const offer = (status: string | undefined, color: Color | undefined) => {
    if (!status || !color || C(color) < 0.03) return;
    if (!out[status] || C(color) > C(out[status])) out[status] = color;
  };
  for (const [key, paint] of paints(site, mode)) offer(statusOf(key.split(":")[0].toLowerCase()), paint.color);
  for (const name of site.vars.keys()) {
    const status = statusOf(name);
    if (!status || out[status] || SUPPORTING.test(name.replace(STATUS.find(([s]) => s === status)![1], ""))) continue;
    const value = resolveVar(site, name, mode);
    try {
      if (value) offer(status, new Color(value));
    } catch {
      // Not a color.
    }
  }
  return out;
}

/** How far a color sits toward the most colorful version of its lightness and hue that the P3 screen can show. */
export function relativeChroma(color: Color): number {
  const [l, c, h] = [L(color), C(color), H(color)];
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (new Color("oklch", [l, mid, h]).inGamut("p3")) lo = mid;
    else hi = mid;
  }
  return lo > 0 ? Math.min(1, c / lo) : 0;
}

function brandColor(site: Site): Color | undefined {
  const light = MODES[0];
  for (const name of site.vars.keys()) {
    if (!/brand|primary|accent/.test(name) || /on-|text|bg|background|hover|active|subtle/.test(name)) continue;
    const value = resolveVar(site, name, light);
    try {
      if (value) return new Color(value);
    } catch {
      // Not a color.
    }
  }
  return undefined;
}

/**
 * Feedback colors: `cvd` is the share of status-color pairs that stay at least 11 apart (CIEDE2000) in
 * typical vision and each color-blindness simulation, in every mode, scaled down when statuses are missing.
 * `harmony` is the share that stay as colorful (for their lightness and hue) as the brand color.
 */
export function feedbackScores(ctx: CheckContext, found: ModePairs): Metrics {
  if (!isWeb(ctx)) return { cvd: null, harmony: null };
  const site = readSite(ctx.files);
  const perMode = [...found.modes.keys()].map((name) => {
    const colors = statusColors(site, name);
    const names = Object.keys(colors);
    if (names.length < 2) return 0;
    const report = checkCvd(Object.fromEntries(names.map((n) => [n, colors[n].toString()])));
    const total = ((names.length * (names.length - 1)) / 2) * 4;
    return (1 - report.failing.length / total) * (names.length / STATUS.length);
  });
  const brand = brandColor(site);
  const light = Object.values(statusColors(site, found.modes.has("light") ? "light" : [...found.modes.keys()][0] ?? "light"));
  const target = brand ? relativeChroma(brand) : undefined;
  const harmony = target === undefined || !light.length ? 0 : light.filter((c) => Math.abs(relativeChroma(c) - target) <= 0.25).length / STATUS.length;
  return { cvd: mean(perMode), harmony };
}

/** Personal colors: static light and dark fallbacks, a script that writes CSS variables, a saved choice, and controls. */
export function personalScores(ctx: CheckContext, found: ModePairs): Metrics {
  const code = [...ctx.changed].filter(([p]) => /\.(m?[jt]sx?|html?)$/.test(p)).map(([, t]) => t).join("\n");
  return {
    personal: mean([
      found.modes.has("light") && found.modes.has("dark") ? 1 : 0,
      /setProperty\(\s*[`'"]--|\bpersonalize\s*\(|chromagentic-runtime/.test(code) ? 1 : 0,
      /localStorage|sessionStorage|indexedDB|document\.cookie/.test(code) ? 1 : 0,
      /type=["']?range|<select\b/.test(code) ? 1 : 0,
    ]),
  };
}

/** Six schemes: dark plugs into the app's `data-theme` switch, and the agent asks about personal colors. */
export function schemeScores(ctx: CheckContext): Metrics {
  const css = [...ctx.changed].filter(([p]) => /\.(css|html?)$/.test(p)).map(([, t]) => t).join("\n");
  const message = ctx.transcript.finalMessage;
  return {
    "switch-wired": /\[data-theme\s*=\s*["']?dark/.test(css) ? 1 : 0,
    asked: /personali[sz]|personal colou?rs|your own colou?rs|choose (their|your) own|adjust (the )?(lightness|contrast)/i.test(message) && /\?/.test(message) ? 1 : 0,
  };
}

export const INTENT_KEYS = ["no-full-scale", "text-tiers", "cvd", "harmony", "personal", "switch-wired", "asked"];

export function intentScores(ctx: CheckContext, found: ModePairs): Metrics {
  const wanted = ctx.scenario.scores ?? [];
  return {
    ...(wanted.includes("roles") && roleScores(ctx, found)),
    ...(wanted.includes("feedback") && feedbackScores(ctx, found)),
    ...(wanted.includes("personal") && personalScores(ctx, found)),
    ...(wanted.includes("schemes") && schemeScores(ctx)),
  };
}

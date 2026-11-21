/**
 * Outcome scores for one agent run, from 0 to 1. Result scores look only at the finished project,
 * so they grade runs with and without the skill the same way. Process scores (did the skill
 * trigger, did the agent use the engine) only apply to runs with the skill.
 */
import Color from "colorjs.io";
import { describeColor } from "../../src/index";
import { checkBuild, findSettings, gradedColors, GENERATE, SUGGEST, type CheckContext } from "./checks";
import { engineColors, matchesEngine } from "./colors";
import { composeModes, dtcgModes, namedPairs, swiftModes } from "./palette";
import { MODES, pairs, paints, readSite, type Mode, type Pair, type Site } from "./render";
import type { Condition, Metrics, SwatchPair } from "./types";

const ratio = (p: Pair) => Color.contrast(p.fg.color, p.bg.color, "WCAG21");
const passes = (p: Pair) => ratio(p) >= p.target - 0.005;
const L = (c: Color) => c.to("oklch").coords[0] ?? 0;
const C = (c: Color) => c.to("oklch").coords[1] ?? 0;
const H = (c: Color) => c.to("oklch").coords[2] ?? 0;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const share = <T>(xs: T[], ok: (x: T) => boolean) => (xs.length ? xs.filter(ok).length / xs.length : null);
const hex = (c: Color) => c.to("srgb").toString({ format: "hex", inGamut: true });

/** One copy of each distinct color pair, so a color repeated on many elements counts once. */
function unique(list: Pair[]): Pair[] {
  const seen = new Map<string, Pair>();
  for (const p of list) seen.set(`${hex(p.fg.color)}|${hex(p.bg.color)}|${p.target}`, p);
  return [...seen.values()];
}

export function passShare(list: Pair[]): number | null {
  return share(unique(list), passes);
}

const mode = (name: string) => MODES.find((m) => m.name === name)!;

/** True when the page looks different in `mode` than in `other`, which means the project defines that mode. */
export function definesMode(site: Site, target: Mode, other: Mode): boolean {
  const a = paints(site, target);
  const b = paints(site, other);
  for (const [key, paint] of a) {
    const there = b.get(key);
    if (!there || paint.color.deltaE(there.color, "OK") > 0.01) return true;
  }
  return false;
}

export interface ModePairs {
  /** Pairs for each mode the project defines, by mode name. */
  modes: Map<string, Pair[]>;
}

/** Find every mode the finished project defines, with its text, icon, and border pairs. */
export function projectModes(files: Map<string, string>, build: string, settingsPath?: string): ModePairs {
  const modes = new Map<string, Pair[]>();
  if (build === "css" || build === "tailwind") {
    const site = readSite(files);
    const light = mode("light");
    const dark = mode("dark");
    const base = pairs(site, light);
    if (definesMode(site, dark, light)) {
      modes.set("light", base);
      modes.set("dark", pairs(site, dark));
    } else {
      // Only one look: call it dark when its page background is dark.
      const page = base.find((p) => p.kind === "text")?.bg.color;
      modes.set(page && L(page) < 0.5 ? "dark" : "light", base);
    }
    if (definesMode(site, mode("light-high-contrast"), light)) modes.set("light-high-contrast", pairs(site, mode("light-high-contrast")));
    if (modes.has("dark") && definesMode(site, mode("dark-high-contrast"), dark)) modes.set("dark-high-contrast", pairs(site, mode("dark-high-contrast")));
    return { modes };
  }
  const named = build === "dtcg" ? dtcgModes(files, settingsPath) : build === "swift" ? swiftModes(files) : composeModes(files);
  for (const m of named) modes.set(m.name, [...(modes.get(m.name) ?? []), ...namedPairs(m)]);
  return { modes };
}

/** The pass share in each mode the task needs. A mode the project should have but doesn't scores 0. */
export function contrastScores(found: ModePairs, required: string[]): Metrics {
  const out: Metrics = {};
  for (const name of required) {
    if (name === "high-contrast") {
      const hc = [...found.modes.keys()].filter((k) => k.endsWith("high-contrast"));
      out["contrast-high-contrast"] = hc.length ? mean(hc.map((k) => passShare(found.modes.get(k)!) ?? 0)) : 0;
    } else out[`contrast-${name}`] = found.modes.has(name) ? passShare(found.modes.get(name)!) ?? 0 : 0;
  }
  return out;
}

/** Modes this run must have: light always, plus any the task asks for or the project already had. */
export function requiredModes(expect: string[] = [], original: ModePairs): string[] {
  const out = new Set(["light"]);
  for (const m of expect) if (m === "dark" || m === "high-contrast") out.add(m);
  for (const m of original.modes.keys()) {
    if (m === "dark") out.add("dark");
    if (m.endsWith("high-contrast")) out.add("high-contrast");
  }
  return [...out];
}

/** Share of new colors in the right format for the platform and inside its gamut. */
export function platformFit(ctx: CheckContext, settingsPath?: string): number {
  const colors = gradedColors(ctx, settingsPath);
  if (!colors.length) return 0;
  const gamut = ctx.fixture.expectFormat === "p3" ? "p3" : "rec2020";
  return share(colors, ({ literal }) => literal.kind === ctx.fixture.expectFormat && literal.color.inGamut(gamut, { epsilon: 0.0005 }))!;
}

/** Share of the new colorful colors whose description matches the words the user asked for. */
export function moodMatch(ctx: CheckContext, settingsPath?: string): number | null {
  const wanted = ctx.scenario.expectWords;
  if (!wanted?.length) return null;
  const seen = new Set<string>();
  const colors = gradedColors(ctx, settingsPath)
    .map(({ literal }) => literal.color)
    .filter((c) => C(c) >= 0.05 && !seen.has(hex(c)) && seen.add(hex(c)));
  return (
    share(colors, (c) => {
      const d = describeColor(c.toString());
      const text = [d.summary, ...d.words, ...d.nouns, ...d.meanings, ...d.effects, ...d.usage, ...d.temperature].join(" ").toLowerCase();
      return wanted.some((w) => text.includes(w.toLowerCase()));
    }) ?? 0
  );
}

/** Did the skill load without being named: the agent opened SKILL.md or ran the bundled engine. */
export function skillTriggered(ctx: CheckContext): number {
  const used = [...ctx.transcript.toolArgs, ...ctx.transcript.commands].some(
    (t) => /skills\/chromagent\/(SKILL\.md|references\/|scripts\/chromagent\.mjs)/.test(t) || GENERATE.test(t) || SUGGEST.test(t),
  );
  return used ? 1 : 0;
}

/** Share of new colors that came from the engine (0 when there's no settings file to trace them to). */
export function engineShare(ctx: CheckContext): number {
  const settings = findSettings(ctx.files);
  if (!settings) return 0;
  const colors = gradedColors(ctx, settings.path);
  if (!colors.length) return 0;
  const engine = engineColors(settings.config);
  return share(colors, ({ literal }) => matchesEngine(literal.color, engine))!;
}

function hueShift(a: Color, b: Color) {
  const d = Math.abs(H(a) - H(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/** How far a light-to-dark (or dark-to-light) conversion kept the original look and roles. */
export function conversionScores(original: Map<string, string>, files: Map<string, string>, from: string, to: string, built: number | null): Metrics {
  const before = readSite(original);
  const after = readSite(files);
  const fromMode = mode(from);
  const toMode = mode(to);
  const has = definesMode(after, toMode, fromMode);
  const oldPairs = new Map(pairs(before, fromMode).map((p) => [p.key, p]));
  const newPairs = has ? new Map(pairs(after, toMode).map((p) => [p.key, p])) : new Map<string, Pair>();
  const matched = [...oldPairs.keys()].filter((k) => newPairs.has(k));

  // Role order: roles that were clearly stronger or weaker than each other should stay that way.
  const groups = new Map<string, { old: number[]; new: number[] }>();
  for (const k of matched) {
    const o = oldPairs.get(k)!;
    const g = groups.get(o.fg.source ?? `${o.kind}:${hex(o.fg.color)}`) ?? { old: [], new: [] };
    g.old.push(ratio(o));
    g.new.push(ratio(newPairs.get(k)!));
    groups.set(o.fg.source ?? `${o.kind}:${hex(o.fg.color)}`, g);
  }
  const roles = [...groups.values()].map((g) => ({ old: mean(g.old)!, new: mean(g.new)! }));
  const orders: boolean[] = [];
  for (let i = 0; i < roles.length; i++)
    for (let j = i + 1; j < roles.length; j++) {
      const [a, b] = roles[i].old >= roles[j].old ? [roles[i], roles[j]] : [roles[j], roles[i]];
      if (a.old / b.old >= 1.15) orders.push(a.new > b.new);
    }

  const oldPaints = paints(before, fromMode);
  const keptPaints = paints(after, fromMode);
  const newPaints = has ? paints(after, toMode) : new Map();
  const chromatic = [...oldPaints].filter(([, p]) => C(p.color) >= 0.05);
  const delta = (p: Pair) => Math.abs(L(p.fg.color) - L(p.bg.color));

  return {
    "new-mode": has ? passShare([...newPairs.values()]) ?? 0 : 0,
    "role-order": has ? share(orders, Boolean) : 0,
    // Perceived contrast: the lightness gap shouldn't shrink, even where the WCAG ratio passes.
    balance: has ? share(matched, (k) => delta(newPairs.get(k)!) >= delta(oldPairs.get(k)!) - 0.03) ?? 0 : 0,
    "hue-kept": has
      ? share(chromatic, ([k, p]) => {
          const n = newPaints.get(k);
          return Boolean(n && C(n.color) >= 0.03 && hueShift(p.color, n.color) <= 15);
        })
      : 0,
    "original-kept": share([...oldPaints], ([k, p]) => {
      const n = keptPaints.get(k);
      return Boolean(n && p.color.deltaE(n.color, "OK") <= 0.02);
    }),
    switch: has && built !== 0 ? 1 : 0,
  };
}

/** Pairs in each mode as plain colors, for the gallery. */
export function swatches(found: ModePairs): Record<string, SwatchPair[]> {
  const out: Record<string, SwatchPair[]> = {};
  for (const [name, list] of found.modes) {
    out[name] = unique(list).map((p) => ({
      role: p.fg.source ?? p.key.split("|")[1]?.split(":")[0] ?? p.key,
      kind: p.kind,
      fg: p.fg.color.toString({ format: "oklch", precision: 4 }),
      bg: p.bg.color.toString({ format: "oklch", precision: 4 }),
      ratio: Math.round(ratio(p) * 100) / 100,
      target: p.target,
    }));
  }
  return out;
}

const RESULT_KEYS = ["contrast", "fit", "mood", "build", "new-mode", "role-order", "balance", "hue-kept", "original-kept", "switch"];

/** Every score for one run, plus `result`: the average of the result scores that apply. */
export function scoreRun(ctx: CheckContext, condition: Condition): { metrics: Metrics; swatches: Record<string, SwatchPair[]> } {
  const settings = findSettings(ctx.files);
  const build = ctx.fixture.build;
  const found = projectModes(ctx.files, build, settings?.path);
  const original = projectModes(ctx.original, build);
  const required = ctx.scenario.conversion ? [ctx.scenario.conversion.from, ctx.scenario.conversion.to] : requiredModes(ctx.scenario.expectModes, original);
  const perMode = contrastScores(found, required);
  const builtCheck = checkBuild(ctx, settings);
  const built = builtCheck.status === "skip" ? null : builtCheck.status === "pass" ? 1 : 0;
  const metrics: Metrics = {
    ...perMode,
    contrast: mean(Object.values(perMode).filter((v): v is number => v !== null)),
    fit: platformFit(ctx, settings?.path),
    mood: moodMatch(ctx, settings?.path),
    build: built,
  };
  if (ctx.scenario.conversion) Object.assign(metrics, conversionScores(ctx.original, ctx.files, ctx.scenario.conversion.from, ctx.scenario.conversion.to, built));
  metrics.result = mean(RESULT_KEYS.map((k) => metrics[k]).filter((v): v is number => typeof v === "number"));
  metrics.triggered = condition === "skill" ? skillTriggered(ctx) : null;
  metrics.engine = condition === "skill" ? engineShare(ctx) : null;
  return { metrics, swatches: swatches(found) };
}

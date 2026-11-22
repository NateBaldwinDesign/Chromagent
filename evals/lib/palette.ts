/**
 * Color pairs for projects without HTML (design tokens, Jetpack Compose, SwiftUI), found by role
 * names like `background`, `text`, `onPrimary`, and `border`. Approximate on purpose: it grades
 * the same way with or without the skill.
 */
import Color from "colorjs.io";
import { extractColors } from "./colors";
import type { Pair, Paint } from "./render";

export interface NamedMode {
  /** "light", "dark", "light-high-contrast", or "dark-high-contrast". */
  name: string;
  colors: Map<string, Color>;
}

const SKIP = /disabled|shadow|overlay|scrim|transparent|hover|pressed|active|focus-?ring|selected|inverse/i;
const BORDER = /border|divider|outline|stroke|separator|\bline\b/i;
const STRONG = /strong|input|control|focus/i;
const BACKGROUND = /background|^bg\b|\bbg$|page|canvas|surface|card|panel|container|sheet|base/i;
const TEXT = /text|foreground|\bfg\b|ink|content|label|heading|title|body|muted|subtle|link|placeholder/i;
const FILL = /accent|brand|primary|secondary|tertiary|interactive|error|success|warning|info|danger|critical|positive|negative/i;
const ICON = /icon|glyph/i;

const words = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[._/\s]+/g, "-").toLowerCase();

/** The color a name like `onPrimary`, `primary-foreground`, or `text-on-accent` sits on. */
function baseOf(name: string, all: Set<string>): string | undefined {
  const w = words(name);
  const target = /^on-(.+)$/.exec(w)?.[1] ?? /^(.+)-(foreground|fg)$/.exec(w)?.[1] ?? /(?:^|-)(?:text|content|label)-on-(.+)$/.exec(w)?.[1];
  if (!target) return undefined;
  return [...all].find((n) => n !== name && words(n) === target) ?? [...all].find((n) => n !== name && !/^on-/.test(words(n)) && (words(n).endsWith(`-${target}`) || words(n).endsWith(`${target}-background`)));
}

function lightness(c: Color) {
  return c.to("oklch").coords[0] ?? 0;
}

/** Text, icon, and border pairs in one mode, by role name. */
export function namedPairs(mode: NamedMode): Pair[] {
  const names = new Set(mode.colors.keys());
  const paint = (name: string): Paint => ({ color: mode.colors.get(name)!, source: name });
  const backgrounds = [...names].filter((n) => BACKGROUND.test(words(n)) && !TEXT.test(words(n)) && !BORDER.test(words(n)) && !baseOf(n, names) && !SKIP.test(n));
  const base =
    backgrounds.find((n) => /^(color-)?(background|bg|page|canvas)(-(default|base|primary|page))?$/.test(words(n))) ??
    backgrounds.find((n) => /background|page|canvas/.test(words(n))) ??
    backgrounds[0];
  if (!base) return [];
  // Surfaces close to the page background (cards, panels) also carry text and borders.
  const surfaces = backgrounds.filter((n) => n === base || contrastRatio(mode.colors.get(n)!, mode.colors.get(base)!) < 1.5);
  const out: Pair[] = [];
  for (const name of names) {
    const w = words(name);
    if (SKIP.test(w) || surfaces.includes(name)) continue;
    const on = baseOf(name, names);
    if (on) {
      out.push({ key: `${name}:on`, kind: "text", fg: paint(name), bg: paint(on), target: 4.5 });
      continue;
    }
    let kind: Pair["kind"] | undefined;
    let target = 0;
    if (BORDER.test(w)) [kind, target] = STRONG.test(w) ? ["control-border", 3] : /variant|subtle/.test(w) ? ["border", 1.2] : /outline/.test(w) ? ["control-border", 3] : ["border", 1.2];
    else if (ICON.test(w)) [kind, target] = ["icon", 3];
    // Text roles, and "on" colors whose own background isn't defined, are read on the surfaces.
    else if (TEXT.test(w) || /^on-|-(foreground|fg)$/.test(w)) [kind, target] = ["text", 4.5];
    else if (FILL.test(w) && !BACKGROUND.test(w)) [kind, target] = ["icon", 3];
    if (!kind) continue;
    for (const s of surfaces) out.push({ key: `${name}:${s}`, kind, fg: paint(name), bg: paint(s), target });
  }
  return out;
}

function contrastRatio(a: Color, b: Color) {
  const la = a.luminance;
  const lb = b.luminance;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Decide "light"/"dark" from the page background, and add "-high-contrast" when the name says so. */
function modeName(label: string, colors: Map<string, Color>): string {
  const pairs = namedPairs({ name: label, colors });
  const bg = pairs[0]?.bg.color ?? [...colors.values()][0];
  const scheme = /dark/i.test(label) ? "dark" : /light/i.test(label) ? "light" : bg && lightness(bg) < 0.5 ? "dark" : "light";
  return /high-?contrast|\bhc\b|contrast-?more|increased/i.test(label) ? `${scheme}-high-contrast` : scheme;
}

function firstColor(text: string): Color | undefined {
  return extractColors(text)[0]?.color;
}

/** DTCG token files: one mode per file (`dark.tokens.json`) or per top-level group (`{ "dark": {...} }`). */
export function dtcgModes(files: Map<string, string>, skip?: string): NamedMode[] {
  const out: NamedMode[] = [];
  for (const [path, text] of files) {
    if (!path.endsWith(".json") || path === skip || /(^|\/)(package|tsconfig|eval)[^/]*\.json$|chromagentic\.theme\.json$/.test(path)) continue;
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(text);
    } catch {
      continue;
    }
    const groups: [string, unknown][] = Object.keys(doc).some((k) => /^(light|dark|high-?contrast|hc)/i.test(k))
      ? Object.entries(doc).filter(([k]) => /light|dark|contrast|hc/i.test(k)).map(([k, v]) => [`${path}:${k}`, v])
      : [[path, doc]];
    for (const [label, root] of groups) {
      const raw = new Map<string, unknown>();
      const walk = (node: unknown, trail: string[]) => {
        if (!node || typeof node !== "object") return;
        const obj = node as Record<string, unknown>;
        if ("$value" in obj) return void raw.set(trail.join("."), obj.$value);
        for (const [k, v] of Object.entries(obj)) if (!k.startsWith("$")) walk(v, [...trail, k]);
      };
      walk(root, []);
      const colors = new Map<string, Color>();
      const resolve = (value: unknown, depth = 0): Color | undefined => {
        if (typeof value === "string") {
          const alias = /^\{(.+)\}$/.exec(value)?.[1];
          if (alias) return depth < 10 ? resolve(raw.get(alias), depth + 1) : undefined;
          return firstColor(value);
        }
        if (value && typeof value === "object") return firstColor(JSON.stringify({ $value: value }));
        return undefined;
      };
      for (const [name, value] of raw) {
        const c = resolve(value);
        if (c) colors.set(name.replace(/^colou?r\./, ""), c);
      }
      if (colors.size) out.push({ name: modeName(label, colors), colors });
    }
  }
  return out;
}

function balanced(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

/** Splits call arguments at commas that aren't inside brackets. */
function splitTop(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      out.push(args.slice(start, i));
      start = i + 1;
    }
  }
  out.push(args.slice(start));
  return out;
}

/** Jetpack Compose: `lightColorScheme(...)` and `darkColorScheme(...)` arguments, with `val` colors resolved. */
export function composeModes(files: Map<string, string>): NamedMode[] {
  const vals = new Map<string, Color>();
  const kotlin = [...files].filter(([p]) => p.endsWith(".kt"));
  // `object Palette { val text = ... }` is stored as both `Palette.text` and `text`, so light and dark objects don't collide.
  const owner = (text: string, at: number) => {
    let found: string | undefined;
    for (const o of text.matchAll(/\bobject\s+(\w+)[^{]*\{/g)) {
      if (o.index! > at) break;
      let depth = 0;
      let end = text.length;
      for (let i = o.index! + o[0].length - 1; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}" && --depth === 0) {
          end = i;
          break;
        }
      }
      if (at < end) found = o[1];
    }
    return found;
  };
  const store = (text: string, at: number, name: string, c: Color) => {
    const obj = owner(text, at);
    if (obj) vals.set(`${obj}.${name}`, c);
    if (!obj || !vals.has(name)) vals.set(name, c);
  };
  const lookup = (value: string) => vals.get(value) ?? vals.get(value.split(".").pop()!);
  for (const [, text] of kotlin) {
    for (const m of text.matchAll(/\bval\s+(\w+)\s*(?::\s*Color\s*)?=\s*(Color\s*\()/g)) {
      const c = firstColor(m[2] + balanced(text, m.index! + m[0].length - 1) + ")");
      if (c) store(text, m.index!, m[1], c);
    }
  }
  // Aliases like `val Purple40 = AcmeColors.accent`, a few rounds deep.
  for (let round = 0; round < 3; round++)
    for (const [, text] of kotlin)
      for (const m of text.matchAll(/\bval\s+(\w+)\s*(?::\s*Color\s*)?=\s*([A-Za-z_][\w.]*)\s*$/gm)) {
        const c = lookup(m[2]);
        if (c && !vals.has(m[1])) store(text, m.index!, m[1], c);
      }
  const out: NamedMode[] = [];
  for (const [, text] of kotlin) {
    // Material `lightColorScheme(...)`, or the project's own colors class: `val DarkAppColors = AppColors(text = ..., ...)`.
    for (const m of text.matchAll(/(?:val\s+(\w+)\s*(?::\s*\w+\s*)?=\s*)?\b((?:light|dark)ColorScheme|[A-Z]\w*(?:Colors|Palette|Scheme))\s*\(/g)) {
      const material = /ColorScheme$/.test(m[2]) && /^(light|dark)/.test(m[2]);
      if (!material && !/light|dark|contrast/i.test(m[1] ?? "")) continue;
      const args = balanced(text, m.index! + m[0].length - 1);
      const colors = new Map<string, Color>();
      for (const arg of splitTop(args)) {
        const a = /^\s*(\w+)\s*=\s*([\s\S]+)$/.exec(arg);
        if (!a) continue;
        const value = a[2].trim();
        const named = /^Color\.(White|Black)$/.exec(value)?.[1];
        const c = lookup(value) ?? (named ? new Color(named === "White" ? "#fff" : "#000") : firstColor(value));
        if (c) colors.set(a[1], c);
      }
      if (colors.size >= (material ? 1 : 3)) out.push({ name: modeName(`${m[1] ?? ""} ${m[2]}`, colors), colors });
    }
  }
  // One set per mode: the fullest one wins (a project may have both a Material scheme and its own class).
  const best = new Map<string, NamedMode>();
  for (const m of out) if ((best.get(m.name)?.colors.size ?? 0) < m.colors.size) best.set(m.name, m);
  return [...best.values()];
}

/** SwiftUI: named colors in Swift code (with `light:`/`dark:` pairs), and asset catalog color sets. */
export function swiftModes(files: Map<string, string>): NamedMode[] {
  const light = new Map<string, Color>();
  const dark = new Map<string, Color>();
  for (const [path, text] of files) {
    if (path.endsWith(".swift")) {
      for (const m of text.matchAll(/\b(?:let|var)\s+(\w+)\s*(?::\s*\w+\s*)?(?:=|\{)\s*([^\n]+)/g)) {
        const found = extractColors(m[2], path);
        if (!found.length) continue;
        const darkAt = m[2].search(/\bdark\s*:/);
        light.set(m[1], found[0].color);
        if (darkAt !== -1 && found[1]) dark.set(m[1], found[1].color);
      }
    }
    const set = /([^/]+)\.colorset\/Contents\.json$/.exec(path)?.[1];
    if (set) {
      try {
        const doc = JSON.parse(text) as { colors?: { appearances?: { value: string }[] }[] };
        for (const entry of doc.colors ?? []) {
          const c = extractColors(JSON.stringify({ colors: [entry] }), path)[0]?.color;
          if (!c) continue;
          (entry.appearances?.some((a) => a.value === "dark") ? dark : light).set(set, c);
        }
      } catch {
        // Not valid JSON: the build check reports it.
      }
    }
  }
  const out: NamedMode[] = [];
  if (light.size) out.push({ name: "light", colors: light });
  if (dark.size) out.push({ name: "dark", colors: new Map([...light, ...dark]) });
  return out;
}

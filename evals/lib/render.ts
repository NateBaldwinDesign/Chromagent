/**
 * A tiny, approximate "renderer" for web practice projects. For every HTML element it works out
 * the text, background, and border colors in each mode, from CSS rules, CSS variables, and
 * Tailwind utilities. It's used to grade colors the same way with or without the skill.
 */
import Color from "colorjs.io";
import { readFileSync } from "node:fs";

const TAILWIND: Record<string, string> = JSON.parse(readFileSync(new URL("./tailwind-colors.json", import.meta.url), "utf8")).colors;

export interface Mode {
  name: string;
  scheme: "light" | "dark";
  contrast: "normal" | "more";
}

export const MODES: Mode[] = [
  { name: "light", scheme: "light", contrast: "normal" },
  { name: "dark", scheme: "dark", contrast: "normal" },
  { name: "light-high-contrast", scheme: "light", contrast: "more" },
  { name: "dark-high-contrast", scheme: "dark", contrast: "more" },
];

/** What a rule or variable needs to apply. */
interface Condition {
  scheme?: "light" | "dark";
  contrast?: "more";
  /** States like hover, or screen sizes: never applied. */
  never?: boolean;
}

interface Decl {
  cond: Condition;
  order: number;
  value: string;
}

interface Rule {
  /** Compound selectors from outer to inner, e.g. [".card", "p"]. */
  path: string[];
  cond: Condition;
  order: number;
  decls: Map<string, string>;
}

export interface Element {
  tag: string;
  classes: string[];
  id?: string;
  /** Direct text, trimmed. */
  text: string;
  parent?: Element;
  /** Stable name for matching the same element before and after the agent's changes. */
  key: string;
}

export interface Site {
  rules: Rule[];
  vars: Map<string, Decl[]>;
  elements: Element[];
  /** Modes the project defines on purpose (beyond the default). */
  schemes: Set<"light" | "dark">;
  highContrast: boolean;
}

export interface Paint {
  color: Color;
  /** The CSS variable the color came from, if any. */
  source?: string;
}

export interface Pair {
  key: string;
  kind: "text" | "large-text" | "border" | "control-border" | "icon";
  fg: Paint;
  bg: Paint;
  target: number;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const SKIP_TAGS = new Set(["script", "style", "head", "title", "meta", "link", "template", "noscript"]);
const ROOTS = new Set([":root", "html", "body", "*", ":host", "@theme"]);

function tryColor(text: string): Color | undefined {
  try {
    const c = new Color(text.trim());
    return c.alpha === undefined || Number(c.alpha) >= 0.999 ? c : undefined;
  } catch {
    return undefined;
  }
}

function mediaCondition(query: string): Condition {
  const q = query.toLowerCase();
  const cond: Condition = {};
  if (/prefers-color-scheme\s*:\s*dark/.test(q)) cond.scheme = "dark";
  if (/prefers-color-scheme\s*:\s*light/.test(q)) cond.scheme = "light";
  if (/prefers-contrast\s*:\s*(more|high)/.test(q)) cond.contrast = "more";
  if (/prefers-contrast\s*:\s*(less|low)|forced-colors|print|min-width|max-width|hover|prefers-reduced/.test(q)) cond.never = true;
  return cond;
}

const MODE_PART = /\.([\w-]+)|\[([^\]]+)\]/g;

/** Pull mode markers like `.dark` or `[data-theme="dark"]` out of a selector. */
function selectorCondition(selector: string): { cond: Condition; rest: string } {
  const cond: Condition = {};
  const rest = selector
    .replace(/:where\(([^()]*)\)|:is\(([^()]*)\)/g, (_, a, b) => ` ${a ?? b} `)
    .replace(MODE_PART, (part, cls: string | undefined, attr: string | undefined) => {
      const text = (cls ?? attr ?? "").toLowerCase();
      if (cls === undefined && !/theme|mode|scheme|contrast|appearance/.test(text)) return part;
      if (/high-?contrast|contrast-?more|\bhc\b|contrast="?(more|high)/.test(text)) cond.contrast = "more";
      else if (/dark/.test(text)) cond.scheme = "dark";
      else if (/light/.test(text)) cond.scheme = "light";
      else return part;
      return " ";
    });
  return { cond, rest: rest.replace(/\s+/g, " ").trim() };
}

function merge(a: Condition, b: Condition): Condition {
  return {
    scheme: b.scheme ?? a.scheme,
    contrast: b.contrast ?? a.contrast,
    never: a.never || b.never || (a.scheme && b.scheme && a.scheme !== b.scheme) || undefined,
  };
}

export function applies(cond: Condition, mode: Mode) {
  if (cond.never) return false;
  if (cond.scheme && cond.scheme !== mode.scheme) return false;
  if (cond.contrast && mode.contrast !== "more") return false;
  return true;
}

const weight = (c: Condition) => Number(Boolean(c.scheme)) + Number(Boolean(c.contrast));

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function parseCss(css: string, site: Site, counter: { n: number }) {
  const text = stripComments(css);
  const walk = (start: number, end: number, cond: Condition, inTheme: boolean) => {
    let i = start;
    while (i < end) {
      const open = text.indexOf("{", i);
      const semi = text.indexOf(";", i);
      if (open === -1 || open >= end) {
        if (inTheme) declarations(text.slice(i, end), ["@theme"], cond);
        return;
      }
      if (semi !== -1 && semi < open && /^\s*@/.test(text.slice(i, semi))) {
        i = semi + 1; // @import, @custom-variant ...;
        continue;
      }
      let depth = 1;
      let j = open + 1;
      while (j < end && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const prelude = text.slice(i, open).trim();
      const bodyStart = open + 1;
      const bodyEnd = j - 1;
      if (prelude.startsWith("@media")) walk(bodyStart, bodyEnd, merge(cond, mediaCondition(prelude)), inTheme);
      else if (prelude.startsWith("@theme")) walk(bodyStart, bodyEnd, cond, true);
      else if (/^@(layer|supports|container)/.test(prelude)) walk(bodyStart, bodyEnd, cond, inTheme);
      else if (prelude.startsWith("@variant")) {
        const v = prelude.slice(8).trim();
        walk(bodyStart, bodyEnd, merge(cond, v === "dark" ? { scheme: "dark" } : v === "contrast-more" ? { contrast: "more" } : { never: true }), inTheme);
      } else if (!prelude.startsWith("@")) {
        const body = text.slice(bodyStart, bodyEnd);
        for (const raw of prelude.split(",")) {
          const { cond: sel, rest } = selectorCondition(raw);
          const all = merge(cond, sel);
          const path = rest.replace(/>/g, " ").split(" ").filter(Boolean);
          if (path.some((p) => /:(?!root\b)|\[/.test(p))) {
            declarations(body, [], { ...all, never: true });
            continue;
          }
          declarations(body.replace(/\{[^{}]*\}/g, ""), path.length ? path : [":root"], all);
        }
      }
      i = j;
    }
  };
  const declarations = (body: string, path: string[], cond: Condition) => {
    const decls = new Map<string, string>();
    for (const part of body.split(";")) {
      const at = part.indexOf(":");
      if (at === -1) continue;
      const prop = part.slice(0, at).trim().toLowerCase();
      const value = part.slice(at + 1).replace(/!important/, "").trim();
      if (!prop || !value) continue;
      if (prop.startsWith("--")) {
        const list = site.vars.get(prop) ?? [];
        list.push({ cond, order: counter.n++, value });
        site.vars.set(prop, list);
      } else decls.set(prop, value);
      if (!cond.never && cond.scheme) site.schemes.add(cond.scheme);
      if (!cond.never && cond.contrast) site.highContrast = true;
    }
    if (decls.size) site.rules.push({ path, cond, order: counter.n++, decls });
  };
  walk(0, text.length, {}, false);
}

function parseHtml(html: string): Element[] {
  const out: Element[] = [];
  const stack: Element[] = [];
  const seen = new Map<string, number>();
  const body = html.replace(/<!--[\s\S]*?-->/g, "");
  const tokens = body.matchAll(/<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g);
  for (const t of tokens) {
    if (t[3] !== undefined) {
      const top = stack.at(-1);
      if (top && !SKIP_TAGS.has(top.tag)) top.text = (top.text + " " + t[3].replace(/\s+/g, " ")).trim();
      continue;
    }
    const tag = t[1].toLowerCase();
    if (t[0].startsWith("</")) {
      const at = stack.map((e) => e.tag).lastIndexOf(tag);
      if (at !== -1) stack.length = at;
      continue;
    }
    const attrs = t[2];
    const cls = /\bclass(?:Name)?\s*=\s*["']([^"']*)["']/.exec(attrs)?.[1] ?? "";
    const id = /\bid\s*=\s*["']([^"']*)["']/.exec(attrs)?.[1];
    const el: Element = { tag, classes: cls.split(/\s+/).filter(Boolean), id, text: "", parent: stack.at(-1), key: "" };
    out.push(el);
    if (!VOID.has(tag) && !attrs.trim().endsWith("/")) stack.push(el);
  }
  for (const el of out) {
    // Leave out mode variants and color utilities, so adding `dark:` classes or swapping a color class keeps the key.
    const plain = el.classes.filter((c) => !c.includes(":") && !/^(bg|text|border|fill|stroke|outline|ring|divide|from|via|to)-/.test(c)).slice(0, 2).join(".");
    const base = `${el.parent?.tag ?? ""}>${el.tag}${el.id ? "#" + el.id : ""}${plain ? "." + plain : ""}|${el.text.slice(0, 24)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    el.key = n ? `${base}#${n}` : base;
  }
  return out.filter((e) => !SKIP_TAGS.has(e.tag) && !SKIP_TAGS.has(e.parent?.tag ?? ""));
}

export function readSite(files: Map<string, string>): Site {
  const site: Site = { rules: [], vars: new Map(), elements: [], schemes: new Set(), highContrast: false };
  const counter = { n: 0 };
  for (const [path, text] of files) {
    if (path.endsWith(".css")) parseCss(text, site, counter);
    if (/\.html?$/.test(path)) {
      for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) parseCss(m[1], site, counter);
      site.elements.push(...parseHtml(text));
    }
  }
  for (const el of site.elements) for (const c of el.classes) {
    if (/^dark:/.test(c)) site.schemes.add("dark");
    if (/^contrast-more:/.test(c)) site.highContrast = true;
  }
  return site;
}

/** The value of a CSS variable in a mode, following `var()` links. */
export function resolveVar(site: Site, name: string, mode: Mode, depth = 0): string | undefined {
  const decls = (site.vars.get(name) ?? []).filter((d) => applies(d.cond, mode));
  if (!decls.length) {
    const tw = /^--color-(.+)$/.exec(name)?.[1];
    return tw ? TAILWIND[tw] : undefined;
  }
  const best = decls.reduce((a, b) => (weight(b.cond) > weight(a.cond) || (weight(b.cond) === weight(a.cond) && b.order > a.order) ? b : a));
  return depth > 10 ? undefined : substitute(site, best.value, mode, depth + 1);
}

function substitute(site: Site, value: string, mode: Mode, depth: number): string | undefined {
  let failed = false;
  const out = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name: string, fallback?: string) => {
    const v = resolveVar(site, name, mode, depth) ?? fallback?.trim();
    if (v === undefined) failed = true;
    return v ?? "";
  });
  return failed ? undefined : out;
}

/** The first color in a value like `1px solid var(--line)`, with the variable it came from. */
export function paintOf(site: Site, value: string, mode: Mode): Paint | undefined {
  const direct = /^var\(\s*(--[\w-]+)/.exec(value.trim());
  const resolved = substitute(site, value, mode, 0);
  if (!resolved) return undefined;
  const whole = tryColor(resolved);
  if (whole) return { color: whole, source: direct?.[1] };
  const pieces = resolved.match(/(oklch|oklab|lab|lch|rgba?|hsla?|color)\([^()]*\)|#[0-9a-f]{3,8}\b|\b[a-z]+\b/gi) ?? [];
  for (const piece of pieces) {
    if (/^(solid|dashed|dotted|none|inherit|transparent|currentcolor|px|em|rem)$/i.test(piece)) continue;
    const c = tryColor(piece);
    if (c) return { color: c, source: /var\(\s*(--[\w-]+)/.exec(value)?.[1] };
  }
  return undefined;
}

const UTILITY = /^(bg|text|border(?:-[trblxy])?|fill|stroke|outline)-(.+)$/;

/** Tailwind classes as CSS declarations, for one mode. */
function utilityDecls(site: Site, el: Element, mode: Mode): Map<string, { value: string; weight: number }> {
  const out = new Map<string, { value: string; weight: number }>();
  for (const cls of el.classes) {
    const parts = cls.split(":");
    const name = parts.pop()!;
    const cond: Condition = {};
    for (const v of parts) {
      if (v === "dark") cond.scheme = "dark";
      else if (v === "contrast-more") cond.contrast = "more";
      else cond.never = true;
    }
    if (!applies(cond, mode)) continue;
    const m = UTILITY.exec(name);
    if (!m || m[2].includes("/")) continue;
    const shorthand = /^\((?:color:)?(--[\w-]+)\)$/.exec(m[2])?.[1];
    const arbitrary = shorthand ? `var(${shorthand})` : /^\[(?:color:)?(.+)\]$/.exec(m[2])?.[1]?.replace(/_/g, " ");
    if (!arbitrary && resolveVar(site, `--color-${m[2]}`, mode) === undefined) continue;
    const value = arbitrary ?? `var(--color-${m[2]})`;
    const prop = m[1] === "bg" ? "background-color" : m[1] === "text" ? "color" : m[1].startsWith("border") ? "border-color" : m[1];
    const w = weight(cond);
    if ((out.get(prop)?.weight ?? -1) <= w) out.set(prop, { value, weight: w });
  }
  return out;
}

function matchesCompound(el: Element, compound: string) {
  if (compound === "*") return true;
  if (compound === ":root") return el.tag === "html";
  const tag = /^[a-z][\w-]*/i.exec(compound)?.[0];
  if (tag && tag.toLowerCase() !== el.tag) return false;
  for (const m of compound.matchAll(/\.([\w-]+)/g)) if (!el.classes.includes(m[1])) return false;
  const id = /#([\w-]+)/.exec(compound)?.[1];
  if (id && el.id !== id) return false;
  return Boolean(tag || compound.includes(".") || id);
}

function matches(el: Element, path: string[]) {
  if (!path.length) return false;
  if (path.length === 1 && path[0] === ":root") return el.tag === "html";
  if (!matchesCompound(el, path.at(-1)!)) return false;
  let i = path.length - 2;
  for (let p = el.parent; p && i >= 0; p = p.parent) if (matchesCompound(p, path[i]) || ROOTS.has(path[i])) i--;
  return i < 0;
}

/** One element's declared colors in a mode: CSS rules, then utilities on top. */
function declared(site: Site, el: Element, mode: Mode): Map<string, string> {
  const out = new Map<string, { value: string; w: number; order: number }>();
  for (const rule of site.rules) {
    if (!applies(rule.cond, mode) || !matches(el, rule.path)) continue;
    const w = weight(rule.cond) + rule.path.length * 0.01;
    for (const [prop, value] of rule.decls) {
      const prev = out.get(prop);
      if (!prev || w > prev.w || (w === prev.w && rule.order > prev.order)) out.set(prop, { value, w, order: rule.order });
    }
  }
  const result = new Map([...out].map(([k, v]) => [k, v.value]));
  for (const [prop, { value }] of utilityDecls(site, el, mode)) result.set(prop, value);
  return result;
}

interface Computed {
  text?: Paint;
  bg?: Paint;
  border?: Paint;
  backdrop: Paint;
  color: Paint;
}

const CANVAS = { light: new Color("#ffffff"), dark: new Color("#121212") };
const CANVAS_TEXT = { light: new Color("#000000"), dark: new Color("#ffffff") };

export function computeAll(site: Site, mode: Mode): Map<Element, Computed> {
  const out = new Map<Element, Computed>();
  // Without a `color-scheme` setting, browsers draw a white page with black text in every mode.
  const declaredScheme = site.rules.filter((r) => applies(r.cond, mode) && r.decls.has("color-scheme")).at(-1)?.decls.get("color-scheme") ?? "";
  const scheme = /dark/.test(declaredScheme) ? (/light/.test(declaredScheme) ? mode.scheme : "dark") : "light";
  const canvas: Paint = { color: CANVAS[scheme] };
  const canvasText: Paint = { color: CANVAS_TEXT[scheme] };
  for (const el of site.elements) {
    const d = declared(site, el, mode);
    const parent = el.parent ? out.get(el.parent) : undefined;
    const bgValue = d.get("background-color") ?? d.get("background");
    const bg = bgValue ? paintOf(site, bgValue, mode) : undefined;
    const textValue = d.get("color");
    const text = textValue ? paintOf(site, textValue, mode) : undefined;
    const borderValue = d.get("border-color") ?? d.get("border") ?? d.get("border-bottom") ?? d.get("border-top") ?? d.get("border-left") ?? d.get("border-right");
    const border = borderValue && !/^(0|none)\b/.test(borderValue) ? paintOf(site, borderValue, mode) : undefined;
    const backdrop = bg ?? parent?.backdrop ?? canvas;
    const color = text ?? parent?.color ?? canvasText;
    out.set(el, { text, bg, border, backdrop, color });
  }
  return out;
}

const LARGE = new Set(["h1", "h2"]);
const CONTROLS = new Set(["input", "select", "textarea"]);

/** Every text, icon, and border pair on the page in one mode. */
export function pairs(site: Site, mode: Mode): Pair[] {
  const computed = computeAll(site, mode);
  const out: Pair[] = [];
  for (const el of site.elements) {
    const c = computed.get(el)!;
    if (el.tag === "html") continue;
    if (el.text && /\w/.test(el.text)) {
      const large = LARGE.has(el.tag);
      out.push({ key: `${el.key}:text`, kind: large ? "large-text" : "text", fg: c.color, bg: c.backdrop, target: large ? 3 : 4.5 });
    } else if (el.tag === "svg") {
      out.push({ key: `${el.key}:icon`, kind: "icon", fg: c.color, bg: c.backdrop, target: 3 });
    }
    if (c.border) {
      const control = CONTROLS.has(el.tag);
      out.push({ key: `${el.key}:border`, kind: control ? "control-border" : "border", fg: c.border, bg: c.backdrop, target: control ? 3 : 1.2 });
    }
  }
  return out;
}

/** Every color an element shows (text, fill, border), for checking hue and change. */
export function paints(site: Site, mode: Mode): Map<string, Paint> {
  const computed = computeAll(site, mode);
  const out = new Map<string, Paint>();
  for (const el of site.elements) {
    const c = computed.get(el)!;
    if (c.text) out.set(`${el.key}:color`, c.text);
    if (c.bg) out.set(`${el.key}:background`, c.bg);
    if (c.border) out.set(`${el.key}:border`, c.border);
  }
  return out;
}

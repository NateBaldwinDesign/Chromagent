import Color from "colorjs.io";
import { generateTheme } from "../../src/index";
import type { ThemeConfig } from "../../src/index";
import type { Theme } from "../../src/index";

export type LiteralKind = "oklch" | "p3" | "hex" | "rgb" | "other";

export interface ColorLiteral {
  text: string;
  kind: LiteralKind;
  color: Color;
}

const CSS_FUNC = /\b(oklch|oklab|lab|lch|rgba?|hsla?|color)\(([^()]*)\)/gi;
const HEX = /(?<![\w&])#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
const ARGB = /\b0x([0-9a-f]{8})\b/gi;
const TRIPLE = /\bred\s*[:=]\s*([\d.]+)f?\s*,\s*green\s*[:=]\s*([\d.]+)f?\s*,\s*blue\s*[:=]\s*([\d.]+)f?/gi;

function tryColor(text: string): Color | undefined {
  try {
    return new Color(text);
  } catch {
    return undefined;
  }
}

/** Translucent colors (shadows, overlays) are out of scope for now, so they are not graded. */
function isOpaque(color: Color) {
  return color.alpha === undefined || Number(color.alpha) >= 0.999;
}

function kindOf(fn: string, args: string): LiteralKind {
  const name = fn.toLowerCase();
  if (name === "oklch") return "oklch";
  if (name === "color" && /display-p3/i.test(args)) return "p3";
  if (name.startsWith("rgb")) return "rgb";
  return "other";
}

/** DTCG 2025 color values: { colorSpace, components, hex? }. */
function dtcgLiterals(text: string): ColorLiteral[] {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return [];
  }
  const out: ColorLiteral[] = [];
  const space: Record<string, string> = { oklch: "oklch", srgb: "srgb", "display-p3": "p3", oklab: "oklab" };
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const value = obj.$value as Record<string, unknown> | undefined;
    if (value && typeof value === "object" && Array.isArray(value.components) && typeof value.colorSpace === "string") {
      const id = space[value.colorSpace];
      if (id) {
        const color = new Color(id, value.components as [number, number, number]);
        out.push({ text: JSON.stringify(value), kind: id === "oklch" ? "oklch" : id === "p3" ? "p3" : "hex", color });
      }
      return;
    }
    if (typeof obj.$value === "string") {
      const color = tryColor(obj.$value);
      if (color && !obj.$value.startsWith("{")) out.push({ text: obj.$value, kind: obj.$value.startsWith("#") ? "hex" : "other", color });
      return;
    }
    for (const child of Object.values(obj)) walk(child);
  };
  walk(doc);
  return out;
}

/** Find every opaque color written in a file. */
export function extractColors(text: string, fileName = ""): ColorLiteral[] {
  if (fileName.endsWith(".json")) return dtcgLiterals(text);
  const out: ColorLiteral[] = [];
  for (const match of text.matchAll(CSS_FUNC)) {
    const color = tryColor(match[0]);
    if (color && isOpaque(color)) out.push({ text: match[0], kind: kindOf(match[1], match[2]), color });
  }
  for (const match of text.matchAll(HEX)) {
    const color = tryColor(`#${match[1]}`);
    if (color && isOpaque(color)) out.push({ text: match[0], kind: "hex", color });
  }
  for (const match of text.matchAll(ARGB)) {
    const argb = match[1];
    if (argb.slice(0, 2).toLowerCase() !== "ff") continue;
    out.push({ text: match[0], kind: "hex", color: new Color(`#${argb.slice(2)}`) });
  }
  for (const match of text.matchAll(TRIPLE)) {
    const [r, g, b] = [match[1], match[2], match[3]].map(Number);
    if ([r, g, b].some((v) => !(v >= 0 && v <= 1))) continue;
    const around = text.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80);
    const p3 = /display\s*p3/i.test(around);
    out.push({ text: match[0], kind: p3 ? "p3" : "rgb", color: new Color(p3 ? "p3" : "srgb", [r, g, b]) });
  }
  return out;
}

function themeColors(theme: Theme): string[] {
  const out: string[] = [];
  for (const mode of Object.values(theme.modes)) {
    out.push(mode.background.css, mode.background.hex);
    for (const scale of Object.values(mode.scales)) for (const value of Object.values(scale)) out.push(value.css, value.hex);
    for (const value of Object.values(mode.surfaces)) out.push(value.css, value.hex);
    for (const value of Object.values(mode.roles)) out.push(value.css, value.hex);
  }
  return out;
}

/** Every color the engine makes from these settings, in each output gamut, so any platform format can be matched. */
export function engineColors(config: ThemeConfig): Color[] {
  const outputs = [
    config.output ?? {},
    { gamut: "rec2020", format: "oklch" },
    { gamut: "display-p3", format: "rgb" },
    { gamut: "srgb", format: "hex" },
  ] as const;
  const seen = new Set<string>();
  for (const output of outputs) {
    for (const css of themeColors(generateTheme({ ...config, output: { ...output } }))) seen.add(css);
  }
  return [...seen].map((css) => new Color(css));
}

/** True when a color is visually the same as one the engine made (allows for rounding in each format). */
export function matchesEngine(color: Color, engine: Color[], tolerance = 0.012): boolean {
  return engine.some((candidate) => color.deltaE(candidate, "OK") <= tolerance);
}

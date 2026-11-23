import Color from "../math/color";
import type { ContrastFormula } from "../math/contrast";

export interface ColorValue {
  /** The color in the requested output gamut and format. Use this value. */
  css: string;
  /** sRGB hex fallback (gamut-mapped). For wide gamuts, its contrast can differ slightly from `css`. */
  hex: string;
  /** OKLCH coordinates: lightness 0–1, chroma (0–0.4), hue in degrees. */
  oklch: [number, number, number];
  /** Measured contrast of `css` against the base background (surfaces: against their reference surface). */
  contrast: number;
  /** The contrast target after the mode's settings were applied. */
  target: number;
  /** Present when the target could not be reached; the closest possible color was used instead. */
  capped?: true;
}

export interface RoleValue extends ColorValue {
  /** For reference roles: what the role points to, such as "gray.1400" or "surface.background". */
  ref?: string;
  /** For generated roles: the color (scale) it was made from. */
  scale?: string;
  /** For generated roles: the hard minimum contrast (after high-contrast settings). */
  minimum?: number;
  /** For on-colors: the role they sit on. Their contrast is measured against it (lowest across its states). */
  against?: string;
}

/** Aim a hair above the target so tiny differences between contrast checkers never flip a pass to a fail. */
export const SAFETY = 1.0002;
export const round = (value: number, places: number) => Number(value.toFixed(places));
// Report contrast rounded down, so a displayed value never overstates what was measured.
const floor4 = (value: number) => Math.floor(value * 10000 + 1e-7) / 10000;

function hexOf(css: string) {
  const srgb = new Color(css).toGamut({ space: "srgb", method: "css" }).to("srgb");
  return `#${srgb.coords
    .map((c) => Math.round(Math.min(1, Math.max(0, Number(c) || 0)) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function oklchOf(css: string): [number, number, number] {
  const [l, c, h] = new Color(css).to("oklch").coords.map(Number);
  const chroma = Number.isFinite(c) ? c : 0;
  return [round(l, 4), round(chroma, 4), chroma < 1e-4 || !Number.isFinite(h) ? 0 : round(h, 2)];
}

export function colorValue(css: string, contrast: number, target: number): ColorValue {
  const capped = contrast + 1e-6 < target;
  return {
    css,
    hex: hexOf(css),
    oklch: oklchOf(css),
    contrast: floor4(contrast),
    target: round(target, 4),
    ...(capped && { capped: true as const }),
  };
}

export function describeTarget(formula: ContrastFormula, value: number) {
  return formula === "apca" ? `Lc ${round(value, 1)}` : `${round(value, 2)}:1`;
}

/**
 * Moves an sRGB hex color's OKLCH lightness away from `against`, in small steps, until `measure` reaches `minimum`.
 * Returns the original hex if it already passes, or undefined if no lightness passes.
 */
export function strengthenHex(hex: string, against: string, minimum: number, measure: (hex: string, against: string) => number) {
  if (measure(hex, against) + 1e-6 >= minimum) return hex;
  const [l, c, h] = new Color(hex).to("oklch").coords.map((v) => Number(v) || 0);
  const darker = Number(new Color(against).to("oklch").coords[0]) > l;
  for (let i = 1; i <= 200; i += 1) {
    const lightness = darker ? l - i * 0.002 : l + i * 0.002;
    if (lightness < 0 || lightness > 1) break;
    const candidate = hexOf(new Color("oklch", [lightness, c, h]).toString());
    if (measure(candidate, against) >= minimum * SAFETY) return candidate;
  }
  return undefined;
}

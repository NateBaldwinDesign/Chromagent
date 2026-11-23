import Color from "./color";
import { contrastRatio, luminance } from "./colorMath";
import { apcaContrast } from "./apca";

export type ContrastFormula = "wcag2" | "apca";

function linearSrgb(color: string) {
  const coords = new Color(color).to("srgb-linear").coords.map((value) => Number(value) || 0);
  return [coords[0], coords[1], coords[2]] as const;
}

/** WCAG 2 contrast ratio (1–21) between two CSS colors. */
export function wcagContrast(first: string, second: string) {
  return contrastRatio(luminance(linearSrgb(first)), luminance(linearSrgb(second)));
}

/**
 * Contrast between a foreground and background color.
 * WCAG 2 returns a ratio (1–21). APCA returns the absolute Lc value (0–108).
 */
export function contrast(foreground: string, background: string, formula: ContrastFormula = "wcag2") {
  return formula === "apca"
    ? Math.abs(apcaContrast(foreground, background))
    : wcagContrast(foreground, background);
}

import { contrastRatio, luminance, type LinearRgb, type RgbGamut } from "../math/colorMath";
import { apcaFromLuminance } from "../math/apca";
import type { ContrastFormula } from "../math/contrast";
import { apcaLuminanceOfLinear } from "../scales/apcaGeneration";

/** Default lightness step for states (and the starting point for spacing), in OKLCH L. */
export const DEFAULT_STEP = 0.05;
export const MIN_STEP = 0.035;
export const MAX_STEP = 0.07;

/**
 * Converts between a contrast target and lightness distance from the background.
 * Distances use the OKLCH lightness of a gray with the same contrast, so equal
 * distances look like equal steps.
 */
export interface LightnessScale {
  /** Gray-equivalent OKLCH lightness of the background. */
  backgroundL: number;
  /** True when roles get darker than the background. */
  dark: boolean;
  /** Largest reachable distance (to black or white). */
  maxDistance: number;
  contrastAt(distance: number): number;
  distanceFor(target: number): number;
}

export function lightnessScale(
  background: LinearRgb,
  gamut: RgbGamut,
  formula: ContrastFormula,
  dark: boolean,
): LightnessScale {
  const bgY = luminance(background, gamut);
  const backgroundL = Math.cbrt(Math.max(0, bgY));
  const bgApca = formula === "apca" ? apcaLuminanceOfLinear(background, gamut) : 0;
  const maxDistance = dark ? backgroundL : 1 - backgroundL;
  const contrastAt = (distance: number) => {
    const l = Math.min(1, Math.max(0, backgroundL + (dark ? -1 : 1) * Math.min(distance, maxDistance)));
    const y = l ** 3;
    return formula === "apca"
      ? Math.abs(apcaFromLuminance(apcaLuminanceOfLinear([y, y, y], "srgb"), bgApca))
      : contrastRatio(y, bgY);
  };
  const distanceFor = (target: number) => {
    if (contrastAt(maxDistance) <= target) return maxDistance;
    let low = 0;
    let high = maxDistance;
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (contrastAt(mid) < target) low = mid;
      else high = mid;
    }
    return high;
  };
  return { backgroundL, dark, maxDistance, contrastAt, distanceFor };
}

export interface SpacingItem {
  id: string;
  /** Wanted distance from the background. */
  distance: number;
  /** Distance of the role's hard minimum; snapping never goes below it. */
  floor: number;
}

export interface SpacingResult {
  step: number;
  distances: Record<string, number>;
}

function snapWith(items: SpacingItem[], step: number, maxDistance: number) {
  const sorted = [...items].sort((a, b) => a.distance - b.distance);
  const distances: Record<string, number> = {};
  let cost = 0;
  let previous: { k: number; distance: number } | undefined;
  for (const item of sorted) {
    let k = Math.max(1, Math.round(item.distance / step), Math.ceil(item.floor / step - 1e-9));
    if (previous) k = Math.max(k, item.distance > previous.distance + 1e-6 ? previous.k + 1 : previous.k);
    const distance = Math.min(k * step, maxDistance);
    distances[item.id] = distance;
    cost += Math.abs(distance - item.distance);
    previous = { k, distance: item.distance };
  }
  return { cost, distances };
}

/**
 * Snaps every target to equal lightness steps from the background (k × step).
 * Tries steps from 0.035 to 0.07 and keeps the one that moves targets the least
 * (the larger step on a tie). Order is kept, distinct targets stay distinct,
 * and no target drops below its floor.
 */
export function snapToSteps(items: SpacingItem[], maxDistance: number, fixedStep?: number): SpacingResult {
  const steps: number[] = [];
  if (fixedStep !== undefined) steps.push(fixedStep);
  else for (let s = MIN_STEP; s <= MAX_STEP + 1e-9; s += 0.0025) steps.push(Number(s.toFixed(4)));
  let best: SpacingResult & { cost: number } = { step: steps[0], ...snapWith(items, steps[0], maxDistance) };
  for (const step of steps.slice(1)) {
    const result = snapWith(items, step, maxDistance);
    if (result.cost <= best.cost + 1e-9) best = { step, ...result };
  }
  return { step: best.step, distances: best.distances };
}

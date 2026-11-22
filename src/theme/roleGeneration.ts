import { contrastRatio, luminance, outputColorCss, type LinearRgb, type RgbGamut } from "../math/colorMath";
import type { ColorOutputSettings } from "../math/outputSettings";
import { measureOutputContrast } from "../math/outputContrast";
import { apcaContrast, apcaFromLuminance, MAX_APCA } from "../math/apca";
import type { ContrastFormula } from "../math/contrast";
import { generateColors, type DynamicGenerationSettings } from "../scales/generation";
import { apcaLuminanceOfLinear, generateApcaColor } from "../scales/apcaGeneration";
import type { ScaleData } from "../scales/scaleGeneration";
import { ROLE_FLOORS, type NormalizedRole } from "./roles";
import { DEFAULT_STEP, lightnessScale, snapToSteps } from "./spacing";
import { colorValue, oklchOf, round, SAFETY, type RoleValue } from "./values";

export interface Swatch {
  css: string;
  linear: LinearRgb;
  contrast: number;
}

export interface RoleContext {
  formula: ContrastFormula;
  output: ColorOutputSettings;
  gamut: RgbGamut;
  settings: DynamicGenerationSettings;
  background: LinearRgb;
  backgroundCss: string;
  apcaDark: boolean;
  scaleData(name: string): ScaleData;
  /** OKLCH lightness of a scale's first key color, as entered. */
  keyLightness(name: string): number;
  /** Applies the mode's polarity compensation and contrast multiplier to a contrast value. */
  adjust(value: number): number;
  /** The darkest neutral, used as a text-on-accent option. */
  darkest: { css: string; linear: LinearRgb };
  spacing: number | false | undefined;
}

export interface RoleAdjustment {
  role: string;
  /** Contrast after mode settings, before spacing (accents: the closest-to-brand lightness). */
  requested: number;
  /** Contrast used after even spacing. */
  used: number;
}

export interface RoleResult {
  values: Record<string, RoleValue>;
  /** Lightness step (OKLCH L) between neighboring roles and states. */
  step: number;
  adjustments: RoleAdjustment[];
  missed: { role: string; target: number; contrast: number }[];
}

/** Generates every spec-based role for one mode: targets, accent lightness, even spacing, states, and on-colors. */
export function generateRoles(roles: NormalizedRole[], ctx: RoleContext): RoleResult {
  const { formula, gamut } = ctx;
  const max = formula === "apca" ? MAX_APCA : 21;
  const dark = formula === "apca" ? ctx.apcaDark : luminance(ctx.background, gamut) > 0.1791;
  const scale = lightnessScale(ctx.background, gamut, formula, dark);
  const floorOf = (role: NormalizedRole) => Math.min(max, Math.max(role.floor, ctx.adjust(role.floor)));
  const statesOf = (name: string) =>
    roles.filter((r) => r.base === name).sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  const onFloor = (pair: string) => {
    const on = roles.find((r) => r.kind === "on" && r.pair === pair);
    const floor = on?.floor ?? ROLE_FLOORS[formula].on;
    return Math.min(max, Math.max(floor, ctx.adjust(floor)));
  };

  const cache = new Map<string, Swatch>();
  const gen = (scaleName: string, target: number): Swatch => {
    const aim = Math.min(max, target * SAFETY);
    const key = `${scaleName}|${aim}`;
    let swatch = cache.get(key);
    if (!swatch) {
      const data = ctx.scaleData(scaleName);
      if (formula === "apca") {
        const g = generateApcaColor(data, ctx.background, ctx.backgroundCss, aim, ctx.output, ctx.apcaDark);
        swatch = { css: g.css, linear: g.linear, contrast: g.measuredContrast };
      } else {
        const g = generateColors(data, ctx.background, aim, ctx.settings).opaque;
        swatch = { css: g.css, linear: g.linear, contrast: g.measuredContrast };
      }
      cache.set(key, swatch);
    }
    return swatch;
  };

  // Text-on-color options: the app background, white, and the darkest neutral.
  const onOptions = [
    { css: ctx.backgroundCss, linear: ctx.background },
    { css: outputColorCss([1, 1, 1], ctx.output), linear: [1, 1, 1] as LinearRgb },
    ctx.darkest,
  ];
  const fast = (text: LinearRgb, surface: LinearRgb) =>
    formula === "apca"
      ? Math.abs(apcaFromLuminance(apcaLuminanceOfLinear(text, gamut), apcaLuminanceOfLinear(surface, gamut)))
      : contrastRatio(luminance(text, gamut), luminance(surface, gamut));
  const measure = (text: string, surface: string) =>
    formula === "apca" ? Math.abs(apcaContrast(text, surface)) : measureOutputContrast(text, surface, gamut);
  /** Prefers the app background when it passes, otherwise whichever of white or darkest gives more contrast. */
  const pickOn = (surfaces: Swatch[], minimum: number) => {
    const scored = onOptions.map((option) => ({
      option,
      min: Math.min(...surfaces.map((s) => fast(option.linear, s.linear))),
    }));
    const passes = (min: number) => min >= minimum * SAFETY;
    if (passes(scored[0].min)) return { ...scored[0], passes: true };
    const best = scored.slice(1).sort((a, b) => b.min - a.min)[0];
    return { ...best, passes: passes(best.min) };
  };

  const generated = roles.filter((r) => !r.ref);
  const requested: Record<string, number> = {};
  for (const role of generated) {
    if (role.base || role.kind === "on" || role.contrast === undefined) continue;
    requested[role.name] =
      role.kind === "tint"
        ? Math.min(max, ctx.adjust(role.contrast))
        : Math.min(max, Math.max(floorOf(role), ctx.adjust(role.contrast)));
  }
  const distances: Record<string, number> = {};
  for (const [name, target] of Object.entries(requested)) distances[name] = scale.distanceFor(target);
  const original = { ...distances };

  // Accents: the lightness closest to the brand color as entered that still meets every limit.
  const accents = generated.filter((r) => r.kind === "accent" && !r.base && r.contrast === undefined);
  const searchAccent = (role: NormalizedRole, candidates: number[], step: number) => {
    const brand = ctx.keyLightness(role.scale!);
    const states = statesOf(role.name);
    const minimum = onFloor(role.name);
    const floor = floorOf(role);
    let best: { distance: number; cost: number } | undefined;
    let fallback: { distance: number; min: number } | undefined;
    for (const distance of candidates) {
      const base = gen(role.scale!, Math.max(floor, scale.contrastAt(distance)));
      const surfaces = [base, ...states.map((s) => gen(s.scale!, Math.max(floor, scale.contrastAt(distance + (s.step ?? 0) * step))))];
      const on = pickOn(surfaces, minimum);
      const cost = Math.abs(oklchOf(base.css)[0] - brand);
      if (on.passes && (!best || cost < best.cost)) best = { distance, cost };
      if (!fallback || on.min > fallback.min) fallback = { distance, min: on.min };
    }
    return (best ?? fallback)?.distance ?? scale.distanceFor(floor);
  };
  const grid = (from: number, step: number) => {
    const list: number[] = [];
    for (let d = from; d <= scale.maxDistance + 1e-9; d += step) list.push(d);
    return list.length > 0 ? list : [scale.maxDistance];
  };
  let step = typeof ctx.spacing === "number" ? ctx.spacing : DEFAULT_STEP;
  for (const accent of accents) {
    distances[accent.name] = searchAccent(accent, grid(scale.distanceFor(floorOf(accent)), 0.005), step);
    original[accent.name] = distances[accent.name];
    requested[accent.name] = Math.max(floorOf(accent), scale.contrastAt(distances[accent.name]));
  }

  // Even spacing: snap roles to equal lightness steps from the background.
  const spaced = generated.filter((r) => !r.base && r.kind !== "on" && r.kind !== "tint" && r.name in distances);
  if (ctx.spacing !== false && spaced.length > 0) {
    const result = snapToSteps(
      spaced.map((r) => ({ id: r.name, distance: distances[r.name], floor: scale.distanceFor(floorOf(r)) })),
      scale.maxDistance,
      typeof ctx.spacing === "number" ? ctx.spacing : undefined,
    );
    step = result.step;
    Object.assign(distances, result.distances);
    for (const accent of accents) {
      const first = Math.ceil(scale.distanceFor(floorOf(accent)) / step - 1e-9) * step;
      distances[accent.name] = searchAccent(accent, grid(first, step), step);
    }
  }

  const values: Record<string, RoleValue> = {};
  const swatches: Record<string, Swatch> = {};
  const adjustments: RoleAdjustment[] = [];
  const missed: RoleResult["missed"] = [];
  for (const role of generated) {
    if (role.kind === "on") continue;
    const floor = floorOf(role);
    let target: number;
    if (role.base) target = Math.max(floor, scale.contrastAt(distances[role.base] + (role.step ?? 0) * step));
    else if (Math.abs(distances[role.name] - original[role.name]) < 1e-9 && role.kind !== "accent") target = requested[role.name];
    else target = role.kind === "tint" ? requested[role.name] : Math.max(floor, scale.contrastAt(distances[role.name]));
    const swatch = gen(role.scale!, target);
    swatches[role.name] = swatch;
    values[role.name] = {
      ...colorValue(swatch.css, swatch.contrast, target),
      scale: role.scale,
      ...(role.kind !== "tint" && { minimum: round(floor, 4) }),
    };
    if (role.kind !== "tint" && swatch.contrast + 1e-6 < floor) missed.push({ role: role.name, target: floor, contrast: swatch.contrast });
    if (!role.base && Math.abs(target - requested[role.name]) > 0.005 * requested[role.name])
      adjustments.push({ role: role.name, requested: round(requested[role.name], 2), used: round(target, 2) });
  }
  for (const role of generated) {
    if (role.kind !== "on") continue;
    const surfaces = [role.pair!, ...statesOf(role.pair!).map((s) => s.name)].filter((name) => swatches[name]);
    const minimum = floorOf(role);
    const pick = pickOn(surfaces.map((name) => swatches[name]), minimum);
    const measured = Math.min(...surfaces.map((name) => measure(pick.option.css, swatches[name].css)));
    values[role.name] = { ...colorValue(pick.option.css, measured, minimum), minimum: round(minimum, 4), against: role.pair };
    if (measured + 1e-6 < minimum) missed.push({ role: role.name, target: minimum, contrast: measured });
  }
  return { values, step, adjustments, missed };
}

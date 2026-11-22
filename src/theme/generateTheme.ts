import { outputColorCss, type LinearRgb } from "../math/colorMath";
import type { ColorOutputSettings, ColorFormat, ColorGamut } from "../math/outputSettings";
import { measureOutputContrast, parsedOutputLinear } from "../math/outputContrast";
import type { ContrastFormula } from "../math/contrast";
import { MAX_APCA } from "../math/apca";
import {
  applyContrastMultiplier,
  applyPolarityCompensation,
  effectiveContrast,
  multiplyContrast,
  polarityContext,
} from "../modes/polarity";
import { buildScaleData } from "../scales/scaleGeneration";
import { generateColors } from "../scales/generation";
import { apcaPrefersDark, generateApcaColor } from "../scales/apcaGeneration";
import { resolvedBackgroundLinear, surfaceLinear } from "./surfaceGeneration";
import { BASE_SURFACE, normalizeConfig, type NormalizedConfig, type NormalizedMode, type ThemeConfig } from "./config";
import type { ColorScale, ColorSystemDocument, Surface } from "../engineTypes";
import { colorValue, describeTarget, round, SAFETY, type ColorValue, type RoleValue } from "./values";
import { generateRoles, type RoleAdjustment } from "./roleGeneration";
import type { CvdReport } from "./feedback";

export type { ColorValue, RoleValue } from "./values";
export type { RoleAdjustment } from "./roleGeneration";

export interface ThemeMode {
  name: string;
  settings: { backgroundLightness: number; contrastMultiplier: number; polarityCompensation: number };
  media?: string;
  background: ColorValue;
  scales: Record<string, Record<string, ColorValue>>;
  surfaces: Record<string, ColorValue>;
  roles: Record<string, RoleValue>;
  /** Lightness step (OKLCH L) used to space roles and states evenly. */
  spacing?: number;
  /** Color-vision check of the feedback colors: every pair must differ by CIEDE2000 ≥ 11 in each vision. */
  feedback?: CvdReport & { changed: string[] };
}

export interface Theme {
  formula: ContrastFormula;
  gamut: ColorGamut;
  format: ColorFormat;
  defaultMode: string;
  /** Step names in order, shared by every scale. Role-first themes list only the steps that roles reference. */
  steps: string[];
  modes: Record<string, ThemeMode>;
  /** Role targets that even spacing (or the accent's lightness search) moved, per mode. */
  adjustments: (RoleAdjustment & { mode: string })[];
  /** Plain-language notes about targets that could not be met. Empty when everything passed. */
  warnings: string[];
}

function engineDocument(n: NormalizedConfig, mode: NormalizedMode, output: ColorOutputSettings, scales: ColorScale[]) {
  const surfaces: Surface[] = [
    { id: BASE_SURFACE, name: BASE_SURFACE, base: true },
    ...n.surfaces.map((s) => ({
      id: s.name,
      name: s.name,
      reference: s.reference,
      contrast: s.contrast,
      ...(s.color ? { sourceScaleId: s.color } : { source: "base" }),
    })),
  ];
  const document: ColorSystemDocument = {
    backgroundScaleId: n.backgroundScale,
    backgroundLightness: mode.backgroundLightness,
    scales,
    contrasts:
      n.formula === "wcag2"
        ? n.steps.map((step) => ({
            id: step.name,
            value: step.contrast,
            ...(step.opposite !== undefined && { oppositeValue: step.opposite }),
          }))
        : [],
    surfaces,
    settings: {
      side: "auto",
      backgroundBlend: 0,
      colorSourceCurveOffset: -1,
      colorOutput: output,
      contrastReference: "light",
      polarityCompensation: mode.polarityCompensation,
      contrastMultiplier: mode.contrastMultiplier,
    },
  };
  // Polarity compensation first, then the contrast multiplier (as in Spectrum Studio).
  const context = polarityContext(document);
  const adjust =
    n.formula === "apca"
      ? (value: number) => Math.min(MAX_APCA, value * mode.contrastMultiplier)
      : (value: number) => multiplyContrast(effectiveContrast({ value }, context), mode.contrastMultiplier);
  return { document: applyContrastMultiplier(applyPolarityCompensation(document)), adjust };
}

/**
 * Generates a complete color system (scales, surfaces, and roles) for every mode.
 * Throws ThemeConfigError if the settings are invalid.
 */
export function generateTheme(config: ThemeConfig): Theme {
  const n = normalizeConfig(config);
  const output: ColorOutputSettings = { authoringGamut: n.gamut, outputFormat: n.format, mapOutputsToSrgb: false };
  const gamut = n.gamut;
  const scales: ColorScale[] = n.scales.map((s) => ({
    id: s.name,
    name: s.name,
    stops: s.stops,
    interpolation: s.interpolation,
  }));
  const warnings: string[] = [];
  const adjustments: Theme["adjustments"] = [];
  const modes: Record<string, ThemeMode> = {};
  const outputSteps = new Set(n.outputSteps);
  const generatedRoles = Object.values(n.roles).filter((role) => !role.ref);
  const keyLightness = (name: string) => n.scales.find((s) => s.name === name)?.stops[0]?.lightness ?? 0.5;
  const scaleData = (name: string) => buildScaleData(scales.find((s) => s.id === name)!, output);
  let darkest: { css: string; linear: LinearRgb } | undefined;

  for (const mode of n.modes) {
    const { document, adjust } = engineDocument(n, mode, output, scales);
    const backgroundCss = outputColorCss(resolvedBackgroundLinear(document), output);
    const background: LinearRgb = parsedOutputLinear(backgroundCss, gamut);
    const apcaDark = n.formula === "apca" ? apcaPrefersDark(background, gamut) : false;
    const missed: string[] = [];
    let maxedOut = 0;

    const scaleValues: ThemeMode["scales"] = {};
    for (const scale of scales) {
      const data = buildScaleData(scale, output);
      const values: Record<string, ColorValue> = {};
      n.steps.forEach((step, index) => {
        if (!outputSteps.has(step.name)) return;
        let value: ColorValue;
        if (n.formula === "apca") {
          const target = Math.min(MAX_APCA, step.contrast * mode.contrastMultiplier);
          const generated = generateApcaColor(data, background, backgroundCss, Math.min(MAX_APCA, target * SAFETY), output, apcaDark);
          value = colorValue(generated.css, generated.measuredContrast, target);
        } else {
          const target = document.contrasts[index].value;
          // Aim a hair above the target so tiny differences between contrast checkers never flip a pass to a fail.
          const aim = Math.min(21, target * SAFETY);
          const generated = generateColors(data, background, aim, document.settings).opaque;
          value = colorValue(generated.css, generated.measuredContrast, target);
        }
        const isEndpoint = value.oklch[1] === 0 && (value.oklch[0] >= 0.9999 || value.oklch[0] <= 0.0001);
        if (value.capped && isEndpoint && mode.contrastMultiplier > 1) maxedOut += 1;
        else if (value.capped)
          missed.push(`${scale.name}.${step.name} (wanted ${describeTarget(n.formula, value.target)}, got ${describeTarget(n.formula, value.contrast)})`);
        values[step.name] = value;
      });
      if (Object.keys(values).length > 0) scaleValues[scale.name] = values;
    }

    const surfaceValues: ThemeMode["surfaces"] = {};
    let parent: LinearRgb | undefined;
    let parentCss = backgroundCss;
    for (const surface of document.surfaces) {
      const linear = surfaceLinear(surface, document, parent);
      const css = outputColorCss(linear, output);
      const referenceCss = surface.base ? css : surface.reference === "base" ? backgroundCss : parentCss;
      const target = surface.contrast ?? 1;
      const value = colorValue(css, measureOutputContrast(css, referenceCss, gamut), target);
      // Surfaces are always measured with WCAG 2 ratios.
      if (value.capped) missed.push(`surface.${surface.name} (wanted ${round(target, 2)}:1, got ${value.contrast}:1)`);
      surfaceValues[surface.name] = value;
      parent = linear;
      parentCss = css;
    }

    let generated: ReturnType<typeof generateRoles> | undefined;
    if (generatedRoles.length > 0) {
      if (!darkest) {
        const g = generateColors(scaleData(n.backgroundScale), [1, 1, 1], 21, document.settings).opaque;
        darkest = { css: g.css, linear: g.linear };
      }
      generated = generateRoles(generatedRoles, {
        formula: n.formula,
        output,
        gamut,
        settings: document.settings,
        background,
        backgroundCss,
        apcaDark,
        scaleData,
        keyLightness,
        adjust,
        darkest,
        spacing: n.spacing,
      });
      for (const item of generated.missed)
        missed.push(`${item.role} (needs at least ${describeTarget(n.formula, item.target)}, got ${describeTarget(n.formula, item.contrast)})`);
      for (const item of generated.adjustments) adjustments.push({ mode: mode.name, ...item });
      const cvd = generated.feedback;
      if (cvd && !cvd.pass && cvd.worst)
        warnings.push(
          `In "${mode.name}" mode, the feedback colors ${cvd.worst.a} and ${cvd.worst.b} are too similar${cvd.worst.vision === "normal" ? "" : ` for people with ${cvd.worst.vision} color vision`} (difference ${cvd.worst.deltaE}, needs ${cvd.required}). Try a different brand color, or set the feedback colors yourself in "status".`,
        );
    }
    const roles: ThemeMode["roles"] = {};
    for (const [name, role] of Object.entries(n.roles)) {
      if (!role.ref) {
        roles[name] = generated!.values[name];
        continue;
      }
      const [group, item] = role.ref.split(".");
      const source = group === "surface" ? surfaceValues[item] : scaleValues[group][item];
      roles[name] = { ...source, ref: role.ref };
    }

    if (missed.length > 0) {
      const shown = missed.slice(0, 4).join("; ");
      const more = missed.length > 4 ? `; and ${missed.length - 4} more` : "";
      warnings.push(
        `In "${mode.name}" mode, ${missed.length} color${missed.length === 1 ? "" : "s"} could not reach the contrast target, so the closest possible color was used: ${shown}${more}. To fix this, lower those targets or the contrast multiplier, or move the background lightness closer to white or black.`,
      );
    }

    if (maxedOut > 0) {
      warnings.push(
        `In "${mode.name}" mode, the contrast multiplier asked for more contrast than is possible on ${maxedOut} step${maxedOut === 1 ? "" : "s"}, so ${maxedOut === 1 ? "it uses" : "they use"} the strongest color available (pure black or white). This is expected for high-contrast modes.`,
      );
    }

    modes[mode.name] = {
      name: mode.name,
      settings: {
        backgroundLightness: mode.backgroundLightness,
        contrastMultiplier: mode.contrastMultiplier,
        polarityCompensation: mode.polarityCompensation,
      },
      ...(mode.media && { media: mode.media }),
      background: surfaceValues[BASE_SURFACE],
      scales: scaleValues,
      surfaces: surfaceValues,
      roles,
      ...(generated && { spacing: generated.step }),
      ...(generated?.feedback && { feedback: generated.feedback }),
    };
  }

  return {
    formula: n.formula,
    gamut,
    format: n.format,
    defaultMode: n.defaultMode,
    steps: n.outputSteps,
    modes,
    adjustments,
    warnings,
  };
}

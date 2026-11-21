import Color from "colorjs.io";
import { outputColorCss, type LinearRgb } from "../math/colorMath";
import type { ColorOutputSettings, ColorFormat, ColorGamut } from "../math/outputSettings";
import { measureOutputContrast, parsedOutputLinear } from "../math/outputContrast";
import type { ContrastFormula } from "../math/contrast";
import { MAX_APCA } from "../math/apca";
import { applyContrastMultiplier, applyPolarityCompensation } from "../modes/polarity";
import { buildScaleData } from "../scales/scaleGeneration";
import { generateColors } from "../scales/generation";
import { apcaPrefersDark, generateApcaColor } from "../scales/apcaGeneration";
import { resolvedBackgroundLinear, surfaceLinear } from "./surfaceGeneration";
import { BASE_SURFACE, normalizeConfig, type NormalizedConfig, type NormalizedMode, type ThemeConfig } from "./config";
import type { ColorScale, ColorSystemDocument, Surface } from "../engineTypes";

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
  /** What the role points to, such as "gray.1400" or "surface.background". */
  ref: string;
}

export interface ThemeMode {
  name: string;
  settings: { backgroundLightness: number; contrastMultiplier: number; polarityCompensation: number };
  media?: string;
  background: ColorValue;
  scales: Record<string, Record<string, ColorValue>>;
  surfaces: Record<string, ColorValue>;
  roles: Record<string, RoleValue>;
}

export interface Theme {
  formula: ContrastFormula;
  gamut: ColorGamut;
  format: ColorFormat;
  defaultMode: string;
  /** Step names in order, shared by every scale. */
  steps: string[];
  modes: Record<string, ThemeMode>;
  /** Plain-language notes about targets that could not be met. Empty when everything passed. */
  warnings: string[];
}

const SAFETY = 1.0002;
const round = (value: number, places: number) => Number(value.toFixed(places));
// Report contrast rounded down, so a displayed value never overstates what was measured.
const floor2 = (value: number) => Math.floor(value * 100 + 1e-9) / 100;

function hexOf(css: string) {
  const srgb = new Color(css).toGamut({ space: "srgb", method: "css" }).to("srgb");
  return `#${srgb.coords
    .map((c) => Math.round(Math.min(1, Math.max(0, Number(c) || 0)) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function oklchOf(css: string): [number, number, number] {
  const [l, c, h] = new Color(css).to("oklch").coords.map(Number);
  const chroma = Number.isFinite(c) ? c : 0;
  return [round(l, 4), round(chroma, 4), chroma < 1e-4 || !Number.isFinite(h) ? 0 : round(h, 2)];
}

function colorValue(css: string, contrast: number, target: number): ColorValue {
  const capped = contrast + 1e-6 < target;
  return {
    css,
    hex: hexOf(css),
    oklch: oklchOf(css),
    contrast: floor2(contrast),
    target: round(target, 4),
    ...(capped && { capped: true as const }),
  };
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
  return applyContrastMultiplier(applyPolarityCompensation(document));
}

function describeTarget(formula: ContrastFormula, value: number) {
  return formula === "apca" ? `Lc ${round(value, 1)}` : `${round(value, 2)}:1`;
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
  const modes: Record<string, ThemeMode> = {};

  for (const mode of n.modes) {
    const document = engineDocument(n, mode, output, scales);
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
      scaleValues[scale.name] = values;
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

    const roles: ThemeMode["roles"] = {};
    for (const [role, ref] of Object.entries(n.roles)) {
      const [group, item] = ref.split(".");
      const source = group === "surface" ? surfaceValues[item] : scaleValues[group][item];
      roles[role] = { ...source, ref };
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
    };
  }

  return {
    formula: n.formula,
    gamut,
    format: n.format,
    defaultMode: n.defaultMode,
    steps: n.steps.map((s) => s.name),
    modes,
    warnings,
  };
}

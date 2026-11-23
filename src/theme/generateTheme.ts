import { outputColorCss, type LinearRgb } from "../math/colorMath";
import type { ColorOutputSettings, ColorFormat, ColorGamut } from "../math/outputSettings";
import { measureOutputContrast, parsedOutputLinear } from "../math/outputContrast";
import type { ContrastFormula } from "../math/contrast";
import { apcaContrast, MAX_APCA } from "../math/apca";
import {
  applyContrastMultiplier,
  applyPolarityCompensation,
  effectiveContrast,
  multiplyContrast,
  polarityContext,
} from "../modes/polarity";
import { buildScaleData } from "../scales/scaleData";
import { generateColors } from "../scales/colorAtContrast";
import { apcaPrefersDark, generateApcaColor } from "../scales/apcaGeneration";
import { resolvedBackgroundLinear, surfaceLinear } from "./surfaceGeneration";
import { BASE_SURFACE, normalizeConfig, type NormalizedConfig, type NormalizedMode, type ThemeConfig } from "./config";
import type { ColorScale, ColorSystemDocument, Surface } from "../engineTypes";
import { colorValue, describeTarget, round, SAFETY, strengthenHex, type ColorValue, type RoleValue } from "./values";
import { generateRoles, type RoleAdjustment } from "./roleGeneration";
import type { CvdReport } from "./feedbackHues";

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
  /** Plain-language problems: targets or minimums that were not met. Empty when everything passed. `--strict` fails on these. */
  warnings: string[];
  /** Plain-language information that needs no action, such as high-contrast steps that reached pure black or white. */
  notes: string[];
  /** The same warnings and notes with a stable code, the mode, and the roles or steps involved, for scripts and CI. */
  issues: ThemeIssue[];
}

export type ThemeIssueCode = "target-missed" | "feedback-too-similar" | "reference-below-minimum" | "hex-below-minimum" | "maxed-out";

export interface ThemeIssue {
  level: "warning" | "note";
  code: ThemeIssueCode;
  mode: string;
  /** Role names, or scale steps like "gray.1600". */
  colors: string[];
  message: string;
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
  const notes: string[] = [];
  const issues: ThemeIssue[] = [];
  const report = (level: ThemeIssue["level"], code: ThemeIssueCode, mode: string, colors: string[], message: string) => {
    (level === "warning" ? warnings : notes).push(message);
    issues.push({ level, code, mode, colors, message });
  };
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
    const missedNames: string[] = [];
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
          const generated = generateColors(data, background, aim).opaque;
          value = colorValue(generated.css, generated.measuredContrast, target);
        }
        const isEndpoint = value.oklch[1] === 0 && (value.oklch[0] >= 0.9999 || value.oklch[0] <= 0.0001);
        if (value.capped && isEndpoint && mode.contrastMultiplier > 1) maxedOut += 1;
        else if (value.capped) {
          missedNames.push(`${scale.name}.${step.name}`);
          missed.push(`${scale.name}.${step.name} (wanted ${describeTarget(n.formula, value.target)}, got ${describeTarget(n.formula, value.contrast)})`);
        }
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
        const g = generateColors(scaleData(n.backgroundScale), [1, 1, 1], 21).opaque;
        darkest = { css: g.css, linear: g.linear };
      }
      generated = generateRoles(generatedRoles, {
        formula: n.formula,
        output,
        gamut,
        background,
        backgroundCss,
        apcaDark,
        scaleData,
        keyLightness,
        adjust,
        darkest,
        spacing: n.spacing,
      });
      for (const item of generated.missed) {
        missedNames.push(item.role);
        missed.push(`${item.role} (needs at least ${describeTarget(n.formula, item.target)}, got ${describeTarget(n.formula, item.contrast)})`);
      }
      for (const item of generated.adjustments) adjustments.push({ mode: mode.name, ...item });
      const cvd = generated.feedback;
      if (cvd && !cvd.pass && cvd.worst)
        report(
          "warning",
          "feedback-too-similar",
          mode.name,
          [cvd.worst.a, cvd.worst.b],
          `In "${mode.name}" mode, the feedback colors ${cvd.worst.a} and ${cvd.worst.b} are too similar${cvd.worst.vision === "normal" ? "" : ` for people with ${cvd.worst.vision} color vision`} (difference ${cvd.worst.deltaE}, needs ${cvd.required}). Try a different brand color, or set the feedback colors yourself in "status".`,
        );
    }
    const roles: ThemeMode["roles"] = {};
    const maxContrast = n.formula === "apca" ? MAX_APCA : 21;
    const weakRefs: string[] = [];
    const weakRefNames = new Set<string>();
    for (const [name, role] of Object.entries(n.roles)) {
      if (!role.ref) {
        roles[name] = generated!.values[name];
        continue;
      }
      const [group, item] = role.ref.split(".");
      const source = group === "surface" ? surfaceValues[item] : scaleValues[group][item];
      if (role.floor <= 0) {
        roles[name] = { ...source, ref: role.ref };
        continue;
      }
      const minimum = Math.min(maxContrast, Math.max(role.floor, adjust(role.floor)));
      roles[name] = { ...source, ref: role.ref, minimum: round(minimum, 4) };
      if (source.contrast + 1e-6 < minimum) {
        weakRefNames.add(name);
        weakRefs.push(`${name} → ${role.ref} (needs at least ${describeTarget(n.formula, minimum)} for ${role.kind}, got ${describeTarget(n.formula, source.contrast)})`);
      }
    }

    if (weakRefs.length > 0)
      report(
        "warning",
        "reference-below-minimum",
        mode.name,
        [...weakRefNames],
        `In "${mode.name}" mode, ${weakRefs.length} role${weakRefs.length === 1 ? " points" : "s point"} to a step below the minimum contrast for its kind: ${weakRefs.slice(0, 4).join("; ")}${weakRefs.length > 4 ? `; and ${weakRefs.length - 4} more` : ""}. Point it to a stronger step, or if it is decorative, write it as { "ref": "...", "kind": "tint" }.`,
      );

    // The hex fallback is gamut-mapped to sRGB, so check that it still meets each role's minimum.
    const measureHex = (hex: string, against: string) =>
      n.formula === "apca" ? Math.abs(apcaContrast(hex, against)) : measureOutputContrast(hex, against, "srgb");
    const hexMissed: string[] = [];
    const hexMissedNames: string[] = [];
    // On-colors last, so they are checked against their pair's final hex.
    const byPair = Object.entries(roles).sort(([, a], [, b]) => Number(Boolean(a.against)) - Number(Boolean(b.against)));
    for (const [name, value] of byPair) {
      if (value.minimum === undefined || weakRefNames.has(name)) continue;
      const against = value.against ? roles[value.against]?.hex : surfaceValues[BASE_SURFACE].hex;
      if (!against) continue;
      // Generated roles get a slightly stronger hex when gamut mapping cost contrast; references keep their step's hex.
      const fixed = value.ref ? undefined : strengthenHex(value.hex, against, value.minimum, measureHex);
      if (fixed) {
        value.hex = fixed;
        continue;
      }
      // An on-color that can't move further (such as white) can be fixed by moving its pair instead, if the pair still passes.
      const pair = value.against ? roles[value.against] : undefined;
      if (pair && !pair.ref && pair.minimum !== undefined) {
        const moved = strengthenHex(pair.hex, value.hex, value.minimum, measureHex);
        if (moved && measureHex(moved, surfaceValues[BASE_SURFACE].hex) + 1e-6 >= pair.minimum) {
          pair.hex = moved;
          continue;
        }
      }
      const contrast = measureHex(value.hex, against);
      if (contrast + 1e-6 < value.minimum) {
        hexMissedNames.push(name);
        hexMissed.push(`${name} (${value.hex}: ${describeTarget(n.formula, Math.floor(contrast * 100) / 100)}, needs ${describeTarget(n.formula, value.minimum)})`);
      }
    }
    if (hexMissed.length > 0)
      report(
        "warning",
        "hex-below-minimum",
        mode.name,
        hexMissedNames,
        `In "${mode.name}" mode, the sRGB hex fallback for ${hexMissed.length} role${hexMissed.length === 1 ? "" : "s"} falls below the minimum contrast: ${hexMissed.slice(0, 4).join("; ")}${hexMissed.length > 4 ? `; and ${hexMissed.length - 4} more` : ""}. Use the "css" values, or set "output.gamut" to "srgb" if you must ship hex.`,
      );

    if (missed.length > 0) {
      const shown = missed.slice(0, 4).join("; ");
      const more = missed.length > 4 ? `; and ${missed.length - 4} more` : "";
      report(
        "warning",
        "target-missed",
        mode.name,
        missedNames,
        `In "${mode.name}" mode, ${missed.length} color${missed.length === 1 ? "" : "s"} could not reach the contrast target, so the closest possible color was used: ${shown}${more}. To fix this, lower those targets or the contrast multiplier, or move the background lightness closer to white or black.`,
      );
    }

    if (maxedOut > 0) {
      report(
        "note",
        "maxed-out",
        mode.name,
        [],
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
    notes,
    issues,
  };
}

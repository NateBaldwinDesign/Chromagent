// Checks the ported engine against outputs recorded from Spectrum Studio's
// original code (tests/fixtures/studio-reference.json), so nothing changed by accident.
import { describe, expect, it } from "vitest";
import reference from "./fixtures/studio-reference.json";
import { buildScaleData, resolveScaleColorAtLightness } from "../src/scales/scaleData";
import { generateColors } from "../src/scales/colorAtContrast";
import {
  applyContrastMultiplier,
  applyPolarityCompensation,
  backgroundLuminance,
  compensatedContrast,
  effectiveContrast,
  multiplyContrast,
  polarityWeight,
} from "../src/modes/polarity";
import { surfaceLinear } from "../src/theme/surfaceGeneration";
import { gamutClamp, outputColorCss, type LinearRgb } from "../src/math/colorMath";
import type { ColorOutputSettings } from "../src/math/outputSettings";
import type { ColorScale, ColorSystemDocument } from "../src/engineTypes";

const CONTRASTS = [1.06, 1.15, 1.32, 1.6, 2, 2.6, 3.22, 3.95, 4.79, 6.29, 7.9, 10, 12.3, 14.8, 17, 19.5];
const SCALES: Record<string, [number, number, number][]> = {
  gray: [[0.5692623996686854, 0, 0]],
  red: [[0.675, 30.1, 53.3], [0.5779, 30.4, 51.1], [0.3001, 31.5, 25.5]],
  yellow: [[0.8681, 94.1, 44.5], [0.6102, 73.5, 32.4]],
  green: [[0.7335, 154.2, 44.5], [0.3528, 165.7, 18.4], [0.9011, 156.6, 20]],
  blue: [[0.7893, 258.6, 25.6], [0.5335, 266.7, 59.7], [0.3224, 265.9, 38.9], [0.2409, 268.7, 21.8]],
  vivid: [[0.62, 30, 100]],
};
const OUTPUTS: Record<string, ColorOutputSettings> = {
  "srgb-rgb": { authoringGamut: "srgb", outputFormat: "rgb", mapOutputsToSrgb: false },
  "srgb-hex": { authoringGamut: "srgb", outputFormat: "hex", mapOutputsToSrgb: false },
  "srgb-oklch": { authoringGamut: "srgb", outputFormat: "oklch", mapOutputsToSrgb: false },
  "p3-rgb": { authoringGamut: "display-p3", outputFormat: "rgb", mapOutputsToSrgb: false },
  "rec2020-oklch": { authoringGamut: "rec2020", outputFormat: "oklch", mapOutputsToSrgb: false },
};

function scale(name: string, interpolation: "oklch" | "rgb"): ColorScale {
  return {
    id: name,
    name,
    interpolation,
    stops: SCALES[name].map(([lightness, hue, chroma], i) => ({ id: `${name}-${i}`, lightness, hue, chroma })),
  };
}

describe("matches Spectrum Studio reference values", () => {
  it("generates the same scale colors", () => {
    for (const entry of reference.scales) {
      const output = OUTPUTS[entry.output];
      const interpolation = entry.interpolation as "oklch" | "rgb";
      const data = buildScaleData(scale(entry.scale, interpolation), output);
      const bg = resolveScaleColorAtLightness(scale("gray", interpolation), entry.backgroundLightness, output);
      expect(bg.css).toBe(entry.background);
      entry.steps.forEach((step) => {
        const generated = generateColors(data, bg.linear, step.target);
        expect(generated.opaque.css, `${entry.output} ${entry.scale} ${step.target}`).toBe(step.css);
        expect(generated.opaque.measuredContrast).toBeCloseTo(step.measured, 9);
      });
    }
  });

  it("resolves colors at a lightness the same way", () => {
    for (const entry of reference.atLightness) {
      const resolved = resolveScaleColorAtLightness(
        scale(entry.scale, entry.interpolation as "oklch" | "rgb"),
        entry.lightness,
        OUTPUTS["rec2020-oklch"],
      );
      expect(resolved.css).toBe(entry.css);
    }
  });

  it("clamps to gamut the same way", () => {
    for (const entry of reference.gamutClamp) {
      const [l, c, h] = entry.input;
      const linear = gamutClamp(l, c, h, entry.gamut as "srgb");
      linear.forEach((channel, i) => expect(channel).toBeCloseTo(entry.linear[i], 12));
    }
  });

  it("computes polarity compensation and contrast multipliers the same way", () => {
    for (const entry of reference.polarity.compensated) {
      expect(compensatedContrast(entry.ratio, entry.strength, "light")).toBeCloseTo(entry.light, 10);
      expect(compensatedContrast(entry.ratio, entry.strength, "dark")).toBeCloseTo(entry.dark, 10);
    }
    for (const entry of reference.polarity.weight) {
      expect(polarityWeight(entry.y, "light")).toBeCloseTo(entry.light, 12);
      expect(polarityWeight(entry.y, "dark")).toBeCloseTo(entry.dark, 12);
    }
    for (const entry of reference.polarity.effective) {
      const context = { weight: entry.weight, strength: 0.1, reference: "light" as const };
      expect(effectiveContrast({ value: entry.value }, context)).toBeCloseTo(entry.effective, 10);
      expect(effectiveContrast({ value: entry.value, oppositeValue: entry.value * 1.3 }, context)).toBeCloseTo(
        entry.withOpposite,
        10,
      );
    }
    for (const entry of reference.polarity.multiply) {
      expect(multiplyContrast(entry.ratio, entry.multiplier)).toBeCloseTo(entry.value, 12);
    }
  });

  it("resolves modes and surfaces the same way", () => {
    for (const entry of reference.documents) {
      const output = OUTPUTS[entry.output];
      const document: ColorSystemDocument = {
        backgroundScaleId: "gray",
        backgroundLightness: entry.backgroundLightness,
        scales: [scale("gray", "oklch"), scale("blue", "oklch"), scale("red", "oklch")],
        contrasts: CONTRASTS.map((value, i) => ({ id: `c${i}`, value })),
        surfaces: [
          { id: "base", name: "base", base: true },
          { id: "raised", name: "raised", reference: "parent", contrast: 1.1, source: "base" },
          { id: "floating", name: "floating", reference: "base", contrast: 1.6, source: "base" },
          { id: "info", name: "info", reference: "parent", contrast: 1.15, sourceScaleId: "blue" },
        ],
        settings: {
          colorOutput: output,
          contrastReference: "light",
          polarityCompensation: entry.polarity,
          contrastMultiplier: entry.multiplier,
        },
      };
      const resolved = applyContrastMultiplier(applyPolarityCompensation(document));
      expect(backgroundLuminance(resolved)).toBeCloseTo(entry.backgroundLuminance, 12);
      resolved.contrasts.forEach((c, i) => expect(c.value).toBeCloseTo(entry.contrasts[i], 10));
      let parent: LinearRgb | undefined;
      for (const surface of resolved.surfaces) {
        const linear = surfaceLinear(surface, resolved, parent);
        parent = linear;
        expect(outputColorCss(linear, output)).toBe((entry.surfaces as Record<string, string>)[surface.id]);
      }
    }
  });
});

// Copyright 2026 Adobe. All rights reserved.
// Ported from Spectrum Studio tests (polarity.ts, contrast-multiplier.ts,
// color-scale-interpolation.ts), keeping the assertions on pure engine functions.
import { describe, expect, it } from "vitest";
import Color from "colorjs.io";
import {
  applyContrastMultiplier,
  applyPolarityCompensation,
  collapsedContrastIds,
  compensatedContrast,
  divideContrast,
  effectiveContrast,
  multiplyContrast,
  polarityContext,
  polarityWeight,
  type PolarityContext,
} from "../src/modes/polarity";
import { buildScaleData } from "../src/scales/scaleGeneration";
import { generateColors } from "../src/scales/generation";
import { scaleInterpolation } from "../src/scales/scaleInterpolation";
import { measureOutputContrast } from "../src/math/outputContrast";
import type { ColorScale, ColorSystemDocument } from "../src/engineTypes";

const CONTRASTS = [1.06, 1.15, 1.32, 1.6, 2, 2.6, 3.22, 3.95, 4.79, 6.29, 7.9, 10, 12.3, 14.8, 17, 19.5];
const output = { authoringGamut: "srgb", outputFormat: "rgb", mapOutputsToSrgb: false } as const;
const settings = { side: "auto", backgroundBlend: 0, colorSourceCurveOffset: -1, colorOutput: output } as const;

const red: ColorScale = {
  id: "red",
  name: "red",
  interpolation: "rgb",
  stops: [
    { id: "a", lightness: 0.675, hue: 30.1, chroma: 53.3 },
    { id: "b", lightness: 0.5779, hue: 30.4, chroma: 51.1 },
    { id: "c", lightness: 0.3001, hue: 31.5, chroma: 25.5 },
  ],
};

function document(): ColorSystemDocument {
  return {
    backgroundScaleId: "gray",
    backgroundLightness: 1,
    scales: [{ id: "gray", name: "gray", stops: [{ id: "g", lightness: 0.5693, hue: 0, chroma: 0 }] }],
    contrasts: CONTRASTS.map((value, i) => ({ id: `c${i}`, value })),
    surfaces: [
      { id: "bg", name: "bg", base: true },
      { id: "raised", name: "raised", reference: "parent", contrast: 1.1, source: "base" },
    ],
    settings: { ...settings, contrastReference: "light" },
  };
}

describe("polarity compensation (from Studio)", () => {
  const gain = (ratio: number) => (compensatedContrast(ratio, 1, "light") - 1) / (ratio - 1);

  it("boosts subtle contrasts most and barely changes high ones", () => {
    expect(gain(1.06)).toBeGreaterThan(3);
    expect(gain(2.6)).toBeLessThan(2);
    expect(compensatedContrast(1.15, 1, "light") - compensatedContrast(1.06, 1, "light")).toBeGreaterThan(
      2 * (1.15 - 1.06),
    );
    for (const [lower, higher] of [[1.06, 1.15], [1.15, 1.6], [1.6, 2.6], [2.6, 3.95], [3.95, 10], [10, 19.5]]) {
      expect(gain(lower)).toBeGreaterThan(gain(higher));
    }
    expect(Math.abs(compensatedContrast(19.5, 1, "light") - 19.5)).toBeLessThanOrEqual(0.5);
  });

  it("keeps endpoints fixed, is a no-op at zero strength, round trips, and preserves order", () => {
    expect(compensatedContrast(1, 1, "light")).toBe(1);
    expect(compensatedContrast(21, 1, "light")).toBe(21);
    for (const ratio of CONTRASTS) {
      expect(compensatedContrast(ratio, 0, "light")).toBe(ratio);
      expect(compensatedContrast(compensatedContrast(ratio, 0.5, "light"), 0.5, "dark")).toBeCloseTo(ratio, 3);
    }
    const boosted = CONTRASTS.map((ratio) => compensatedContrast(ratio, 1, "light"));
    boosted.forEach((ratio, i) => {
      if (i > 0) expect(ratio).toBeGreaterThan(boosted[i - 1]);
      expect(ratio).toBeGreaterThanOrEqual(CONTRASTS[i]);
    });
  });

  it("weights by background lightness and lets opposite values win at full weight", () => {
    expect(polarityWeight(1, "light")).toBe(0);
    expect(polarityWeight(0, "light")).toBe(1);
    expect(polarityWeight(0, "dark")).toBe(0);
    const full: PolarityContext = { weight: 1, strength: 0.5, reference: "light" };
    expect(effectiveContrast({ value: 3 }, { ...full, weight: 0 })).toBe(3);
    expect(effectiveContrast({ value: 3, oppositeValue: 6 }, full)).toBeCloseTo(6, 9);
  });

  it("flags merged neighbors only", () => {
    const ids = collapsedContrastIds(
      [{ id: "a", value: 17 }, { id: "b", value: 19 }],
      [{ id: "a", value: 21 }, { id: "b", value: 21 }],
    );
    expect([...ids]).toEqual(["a", "b"]);
  });

  it("is identity on white and compensates contrasts and surfaces on black", () => {
    const base = document();
    const compensated = { ...base, settings: { ...base.settings, polarityCompensation: 0.5 } };
    expect(applyPolarityCompensation(compensated)).toBe(compensated);
    const darkDoc = { ...compensated, backgroundLightness: 0 };
    expect(polarityContext(darkDoc).weight).toBeCloseTo(1, 3);
    const dark = applyPolarityCompensation(darkDoc);
    dark.contrasts.forEach((c, i) => expect(c.value).toBeGreaterThanOrEqual(base.contrasts[i].value));
    expect(dark.surfaces[1].contrast!).toBeGreaterThan(1.1);
  });
});

describe("contrast multiplier (from Studio)", () => {
  it("scales the distance from 1:1", () => {
    expect(multiplyContrast(1.06, 2)).toBeCloseTo(1.12, 9);
    expect(multiplyContrast(4.5, 2)).toBeCloseTo(8, 9);
    expect(multiplyContrast(1, 3)).toBe(1);
    expect(multiplyContrast(15, 2)).toBe(21);
    expect(multiplyContrast(4.5, 0)).toBe(1);
    for (const ratio of [1.06, 2.6, 7.9]) {
      expect(multiplyContrast(ratio, 1)).toBe(ratio);
      expect(divideContrast(multiplyContrast(ratio, 1.7), 1.7)).toBeCloseTo(ratio, 9);
    }
    expect(divideContrast(3, 0)).toBe(1);
  });

  it("is a no-op at 1x and applies to contrasts and surfaces otherwise", () => {
    const base = document();
    expect(applyContrastMultiplier(base)).toBe(base);
    const high = applyContrastMultiplier({ ...base, settings: { ...base.settings, contrastMultiplier: 2 } });
    high.contrasts.forEach((c, i) => expect(c.value).toBeCloseTo(multiplyContrast(CONTRASTS[i], 2), 9));
    expect(high.surfaces[1].contrast).toBeCloseTo(1.2, 9);
    expect(high.surfaces[0]).toBe(base.surfaces[0]);
  });
});

describe("scale interpolation (from Studio)", () => {
  it("defaults to OKLCH", () => {
    expect(scaleInterpolation({})).toBe("oklch");
  });

  it("passes contrast targets and runs through each key color on the RGB path", () => {
    const data = buildScaleData(red, output);
    CONTRASTS.forEach((target) => {
      const css = generateColors(data, [1, 1, 1], target, settings).dynamic.css;
      expect(measureOutputContrast(css, "rgb(255 255 255)", "srgb")).toBeGreaterThanOrEqual(target - 0.01);
    });
    for (const stop of red.stops) {
      const key = new Color("oklch", [stop.lightness, (stop.chroma / 100) * 0.4, stop.hue])
        .to("srgb-linear")
        .coords.map(Number);
      expect(
        data.anchors.some((anchor) => anchor.linear.every((channel, i) => Math.abs(channel - key[i]) < 1e-3)),
      ).toBe(true);
    }
    expect(data.anchors.length).toBeLessThanOrEqual(16);
    expect(buildScaleData({ ...red, interpolation: "oklch" }, output).anchors).not.toEqual(data.anchors);
  });
});

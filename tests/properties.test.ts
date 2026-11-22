import Color from "colorjs.io";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contrast, generateTheme, type Theme, type ThemeConfig } from "../src";
import { multiplyContrast } from "../src/modes/polarity";
import { colorJsSpace } from "../src/math/outputSettings";

const RUNS = { numRuns: 25 };
const TOLERANCE = 1e-4;

const keyColor = fc
  .record({ l: fc.double({ min: 0.2, max: 0.9, noNaN: true }), c: fc.double({ min: 0, max: 0.35, noNaN: true }), h: fc.double({ min: 0, max: 359, noNaN: true }) })
  .map(({ l, c, h }) => `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`);
const lightOrDark = fc.oneof(fc.double({ min: 0.9, max: 1, noNaN: true }), fc.double({ min: 0, max: 0.25, noNaN: true }));
const mode = fc.record({
  backgroundLightness: lightOrDark,
  contrastMultiplier: fc.double({ min: 0.7, max: 2, noNaN: true }),
  polarityCompensation: fc.double({ min: 0, max: 0.5, noNaN: true }),
});

const theme = (key: string, extra: Partial<ThemeConfig> = {}) =>
  generateTheme({ colors: { brand: key }, steps: true, status: false, surfaces: {}, roles: {}, ...extra });

function eachColor(t: Theme, fn: (value: Theme["modes"][string]["scales"][string][string], background: string, modeName: string) => void) {
  for (const m of Object.values(t.modes))
    for (const scale of Object.values(m.scales)) for (const value of Object.values(scale)) fn(value, m.background.css, m.name);
}

describe("rules that always hold", () => {
  it.each(["wcag2", "apca"] as const)("every color meets its %s target in every mode, or is reported", (formula) => {
    fc.assert(
      fc.property(keyColor, mode, (key, settings) => {
        const t = theme(key, { formula, modes: { light: { backgroundLightness: 1 }, dark: { backgroundLightness: 0.08 }, custom: settings } });
        let capped = 0;
        eachColor(t, (value, background) => {
          if (value.capped) capped++;
          else expect(contrast(value.css, background, formula)).toBeGreaterThanOrEqual(value.target - TOLERANCE);
        });
        expect(t.warnings.length > 0).toBe(capped > 0);
      }),
      RUNS,
    );
  });

  it.each(["srgb", "display-p3", "rec2020"] as const)("every color sits inside the %s gamut", (gamut) => {
    fc.assert(
      fc.property(keyColor, mode, fc.constantFrom("rgb", "oklch", "hex") , (key, settings, format) => {
        if (format === "hex" && gamut !== "srgb") return;
        const t = theme(key, { modes: { custom: settings }, output: { gamut, format } });
        eachColor(t, (value) => expect(new Color(value.css).inGamut(colorJsSpace(gamut), { epsilon: 1e-3 }), value.css).toBe(true));
      }),
      RUNS,
    );
  });

  it("scale steps move in one direction (no lightness reversals)", () => {
    fc.assert(
      fc.property(keyColor, mode, (key, settings) => {
        const t = theme(key, { modes: { custom: settings } });
        const m = t.modes.custom;
        const backgroundY = new Color(m.background.css).luminance;
        for (const scale of Object.values(m.scales)) {
          const ys = t.steps.map((step) => new Color(scale[step].css).luminance);
          const darker = ys.map((y) => y <= backgroundY + 1e-6);
          // All steps sit on one side of the background, and each step is at least as far away as the one before.
          expect(new Set(darker).size).toBe(1);
          for (let i = 1; i < ys.length; i++)
            if (darker[0]) expect(ys[i]).toBeLessThanOrEqual(ys[i - 1] + 1e-6);
            else expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1] - 1e-6);
        }
      }),
      RUNS,
    );
  });

  it("a 1x multiplier changes nothing", () => {
    fc.assert(
      fc.property(keyColor, lightOrDark, (key, backgroundLightness) => {
        const plain = theme(key, { modes: { m: { backgroundLightness } } });
        const withOne = theme(key, { modes: { m: { backgroundLightness, contrastMultiplier: 1 } } });
        expect(withOne).toEqual(plain);
      }),
      RUNS,
    );
  });

  it("a 1:1 ratio stays 1:1 at any multiplier, and other ratios scale their distance from 1:1", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 3, noNaN: true }), fc.double({ min: 1, max: 21, noNaN: true }), (multiplier, ratio) => {
        expect(multiplyContrast(1, multiplier)).toBe(1);
        expect(multiplyContrast(ratio, 1)).toBeCloseTo(ratio, 10);
        expect(multiplyContrast(ratio, multiplier)).toBeCloseTo(Math.min(21, (ratio - 1) * multiplier + 1), 10);
      }),
    );
  });

  it("0% polarity compensation leaves every target unchanged", () => {
    fc.assert(
      fc.property(keyColor, fc.double({ min: 0, max: 1, noNaN: true }), (key, backgroundLightness) => {
        const t = theme(key, { modes: { m: { backgroundLightness, polarityCompensation: 0 } } });
        t.steps.forEach((step, i) => expect(t.modes.m.scales.brand[step].target).toBeCloseTo(DEFAULT_TARGETS[i], 3));
      }),
      RUNS,
    );
  });

  it("stronger polarity compensation never lowers dark-mode contrast", () => {
    fc.assert(
      fc.property(
        keyColor,
        fc.double({ min: 0, max: 0.25, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (key, backgroundLightness, a, b) => {
          const [weak, strong] = [Math.min(a, b), Math.max(a, b)].map((polarityCompensation) =>
            theme(key, { modes: { m: { backgroundLightness, polarityCompensation } } }).modes.m.scales.brand,
          );
          for (const step of Object.keys(weak)) {
            expect(strong[step].target).toBeGreaterThanOrEqual(weak[step].target - 1e-9);
            if (!strong[step].capped) expect(strong[step].contrast).toBeGreaterThanOrEqual(weak[step].target - TOLERANCE);
          }
        },
      ),
      RUNS,
    );
  });

  it("polarity compensation has no effect on a white background", () => {
    const a = theme("#0265dc", { modes: { m: { backgroundLightness: 1, polarityCompensation: 0 } } });
    const b = theme("#0265dc", { modes: { m: { backgroundLightness: 1, polarityCompensation: 1 } } });
    expect(b.modes.m.scales).toEqual(a.modes.m.scales);
  });
});

const DEFAULT_TARGETS = [1.06, 1.15, 1.32, 1.6, 2, 2.6, 3.22, 3.95, 4.79, 6.29, 7.9, 10, 12.3, 14.8, 17, 19.5];

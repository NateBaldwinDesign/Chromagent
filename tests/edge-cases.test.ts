import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { contrast, generateTheme, suggestColors, toCss, toDtcgModes } from "../src";
import { colorJsSpace } from "../src/math/outputSettings";

const allValues = (theme: ReturnType<typeof generateTheme>) =>
  Object.values(theme.modes).flatMap((m) => Object.values(m.scales).flatMap((s) => Object.values(s)));

describe("edge cases", () => {
  it.each(["wcag2", "apca"] as const)("handles pure white and pure black backgrounds (%s)", (formula) => {
    const theme = generateTheme({
      colors: { brand: "#0265dc" },
      formula,
      modes: { white: { backgroundLightness: 1 }, black: { backgroundLightness: 0 } },
    });
    expect(theme.modes.white.background.hex).toBe("#ffffff");
    expect(theme.modes.black.background.hex).toBe("#000000");
    expect(theme.warnings).toEqual([]);
  });

  it.each([
    ["a P3-only green", "color(display-p3 0 1 0)", "srgb"],
    ["a Rec. 2020 green", "color(rec2020 0 1 0)", "display-p3"],
    ["an impossible OKLCH chroma", "oklch(0.7 0.5 145)", "srgb"],
  ] as const)("maps %s into the requested gamut", (_label, key, gamut) => {
    const theme = generateTheme({ colors: { brand: key }, output: { gamut, format: "rgb" } });
    for (const value of allValues(theme)) expect(new Color(value.css).inGamut(colorJsSpace(gamut), { epsilon: 1e-3 })).toBe(true);
    expect(theme.warnings).toEqual([]);
  });

  it.each(["#000000", "#ffffff"])("accepts %s as a key color", (key) => {
    const theme = generateTheme({ colors: { ink: key }, steps: true });
    expect(theme.warnings).toEqual([]);
    expect(theme.modes.light.scales.ink["1600"].contrast).toBeGreaterThanOrEqual(19.5);
  });

  it("warns, rather than failing, when the background leaves no room for strong contrast", () => {
    const theme = generateTheme({ colors: { brand: "#0265dc" }, steps: true, modes: { mid: { backgroundLightness: 0.6 } } });
    expect(theme.warnings).toHaveLength(1);
    expect(theme.warnings[0]).toMatch(/In "mid" mode, \d+ colors could not reach/);
    const capped = allValues(theme).filter((v) => v.capped);
    expect(capped.length).toBeGreaterThan(0);
    for (const value of capped) expect(value.contrast).toBeLessThan(value.target);
  });

  it("explains impossible APCA targets too", () => {
    const theme = generateTheme({ colors: { brand: "#0265dc" }, steps: true, formula: "apca", modes: { mid: { backgroundLightness: 0.55 } } });
    expect(theme.warnings[0]).toMatch(/wanted Lc/);
  });

  it("collapses to the background with a 0x multiplier", () => {
    const theme = generateTheme({ colors: { brand: "#0265dc" }, status: false, modes: { flat: { contrastMultiplier: 0 } } });
    for (const value of allValues(theme)) {
      expect(value.target).toBe(1);
      expect(contrast(value.css, theme.modes.flat.background.css)).toBeLessThan(1.01);
    }
  });

  it("tops out at pure white with the strongest settings", () => {
    const theme = generateTheme({
      colors: { brand: "#0265dc" },
      steps: true,
      modes: { "dark-high-contrast": { backgroundLightness: 0, contrastMultiplier: 3, polarityCompensation: 1 } },
    });
    const top = theme.modes["dark-high-contrast"].scales.brand["1600"];
    expect(top.hex).toBe("#ffffff");
    expect(top.target).toBe(21);
    expect(toCss(theme)).toContain("--color-text:");
    expect(Object.keys(toDtcgModes(theme))).toEqual(["dark-high-contrast"]);
  });

  it("returns a clear, empty result for words it doesn't know", () => {
    expect(suggestColors("")).toEqual({ colors: [], matchedWords: [], unmatchedWords: [] });
    expect(suggestColors("the and of").colors).toEqual([]);
  });

  it.each([null, undefined, "theme.json", 42, [], { colors: [] }])("rejects unusable settings: %j", (config) => {
    expect(() => generateTheme(config as never)).toThrow(/Invalid theme settings|settings/);
  });
});

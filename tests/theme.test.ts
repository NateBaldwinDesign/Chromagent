import { describe, expect, it } from "vitest";
import { generateTheme } from "../src/theme/generateTheme";
import { contrast, wcagContrast } from "../src/math/contrast";
import { ThemeConfigError } from "../src/theme/config";

const config = {
  colors: { brand: "#FF5A00" },
  steps: true as const,
  modes: {
    light: {},
    dark: { backgroundLightness: 0.08 },
    "high-contrast": { contrastMultiplier: 2 },
    "low-contrast": { contrastMultiplier: 0.7 },
  },
};

describe("generateTheme (WCAG 2)", () => {
  const theme = generateTheme(config);

  it("returns every mode, scale, step, surface, and role", () => {
    expect(Object.keys(theme.modes)).toEqual(["light", "dark", "high-contrast", "low-contrast"]);
    expect(theme.steps).toHaveLength(16);
    const light = theme.modes.light;
    expect(Object.keys(light.scales)).toEqual(["brand", "gray", "green", "orange", "red", "blue"]);
    expect(Object.keys(light.scales.brand)).toEqual(theme.steps);
    expect(Object.keys(light.surfaces)).toEqual(["background", "raised", "floating"]);
    expect(light.roles.accent.ref).toBe("brand.900");
    expect(light.roles.accent.css).toBe(light.scales.brand["900"].css);
    expect(theme.modes.dark.media).toBe("(prefers-color-scheme: dark)");
    expect(light.media).toBeUndefined();
  });

  it("every step meets its target against the background", () => {
    for (const mode of Object.values(theme.modes)) {
      for (const scale of Object.values(mode.scales)) {
        for (const value of Object.values(scale)) {
          if (value.capped) continue;
          expect(wcagContrast(value.css, mode.background.css)).toBeGreaterThanOrEqual(value.target - 1e-4);
        }
      }
    }
  });

  it("the base background follows the mode's background lightness", () => {
    expect(theme.modes.light.background.oklch[0]).toBeCloseTo(1, 3);
    expect(theme.modes.dark.background.oklch[0]).toBeCloseTo(0.08, 3);
  });

  it("dark mode gets slightly more contrast from the 10% polarity default", () => {
    expect(theme.modes.dark.roles.text.target).toBeGreaterThan(theme.modes.light.roles.text.target);
    expect(theme.modes.dark.settings.polarityCompensation).toBe(0.1);
  });

  it("the contrast multiplier raises and lowers targets", () => {
    const target = (mode: string) => theme.modes[mode].roles["text-subtle"].target;
    expect(target("high-contrast")).toBeGreaterThan(target("light"));
    expect(target("low-contrast")).toBeLessThan(target("light"));
    expect(target("high-contrast")).toBeCloseTo(1 + (target("light") - 1) * 2, 2);
  });

  it("surfaces reach their contrast against their reference", () => {
    const light = theme.modes.light;
    expect(wcagContrast(light.surfaces.raised.css, light.background.css)).toBeCloseTo(1.1, 1);
    expect(wcagContrast(light.surfaces.floating.css, light.background.css)).toBeCloseTo(1.6, 1);
    // On a white background, surfaces go darker.
    expect(light.surfaces.raised.oklch[0]).toBeLessThan(1);
  });

  it("returns hex fallbacks and OKLCH coordinates", () => {
    const accent = theme.modes.light.roles.accent;
    expect(accent.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(accent.oklch[2]).toBeGreaterThan(30);
    expect(accent.oklch[2]).toBeLessThan(50);
  });

  it("has no warnings for reachable targets", () => {
    expect(theme.warnings).toEqual([]);
  });

  it("warns in plain language when a target can't be reached", () => {
    const hard = generateTheme({ colors: { brand: "#FF5A00" }, steps: [4.5, 21], status: true, modes: { mid: { backgroundLightness: 0.5 } } });
    expect(hard.modes.mid.scales.brand["200"].capped).toBe(true);
    expect(hard.warnings[0]).toMatch(/could not reach the contrast target/);
  });

  it("explains maxed-out high-contrast steps separately", () => {
    const hc = generateTheme({ colors: { brand: "#FF5A00" }, steps: true, modes: { dark: { backgroundLightness: 0.08, contrastMultiplier: 2 } } });
    expect(hc.warnings.join()).toMatch(/strongest color available/);
  });

  it("supports narrower gamuts and other formats", () => {
    const srgb = generateTheme({ colors: { brand: "#FF5A00" }, output: { gamut: "srgb", format: "hex" }, status: false });
    expect(srgb.modes.light.roles.accent.css).toMatch(/^#[0-9a-f]{6}$/);
    const p3 = generateTheme({ colors: { brand: "#FF5A00" }, output: { gamut: "display-p3", format: "rgb" }, status: false });
    expect(p3.modes.light.roles.accent.css).toMatch(/^color\(display-p3 /);
  });

  it("throws ThemeConfigError for invalid settings", () => {
    expect(() => generateTheme({ colors: {} })).toThrow(ThemeConfigError);
  });
});

describe("generateTheme (APCA)", () => {
  const theme = generateTheme({ formula: "apca", steps: true, colors: { brand: "#0066ff" }, modes: { light: {}, dark: { backgroundLightness: 0.08 } } });

  it("every step reaches its Lc target", () => {
    for (const mode of Object.values(theme.modes)) {
      for (const value of Object.values(mode.scales.brand)) {
        expect(value.capped).toBeUndefined();
        expect(contrast(value.css, mode.background.css, "apca")).toBeGreaterThanOrEqual(value.target - 1e-6);
      }
    }
  });

  it("does not apply polarity compensation (APCA already accounts for polarity)", () => {
    expect(theme.modes.dark.roles.text.target).toBe(theme.modes.light.roles.text.target);
  });

  it("surfaces still use WCAG 2 ratios", () => {
    expect(theme.modes.light.surfaces.raised.target).toBeCloseTo(1.1, 3);
  });
});

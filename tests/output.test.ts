import { describe, expect, it } from "vitest";
import { generateTheme, platformOutput, PLATFORMS, toCss, toDtcg, toDtcgModes } from "../src/index";

const small = generateTheme({
  colors: { brand: "#FF5A00" },
  status: false,
  steps: [1.5, 4.5],
  modes: {
    light: {},
    dark: { backgroundLightness: 0.1 },
    "dark-high-contrast": { backgroundLightness: 0.1, contrastMultiplier: 2 },
  },
});

describe("toCss", () => {
  const css = toCss(small);

  it("matches the snapshot", () => {
    expect(css).toMatchSnapshot();
  });

  it("puts the default mode on :root and each mode behind data-theme", () => {
    expect(css).toContain(':root, [data-theme="light"] {');
    expect(css).toContain('[data-theme="dark"] {');
    expect(css).toContain(`[data-theme="dark-high-contrast"], [data-theme="dark"][data-contrast="more"] {`);
  });

  it("applies modes through media queries, most specific last", () => {
    const dark = css.indexOf("@media (prefers-color-scheme: dark) {");
    const combined = css.indexOf("@media (prefers-color-scheme: dark) and (prefers-contrast: more) {");
    expect(dark).toBeGreaterThan(0);
    expect(combined).toBeGreaterThan(dark);
  });

  it("writes roles as aliases and sets color-scheme", () => {
    expect(css).toContain("--color-text: var(--color-gray-200);");
    expect(css).toContain("--color-text-on-accent: var(--color-surface-background);");
    expect(css).toContain("color-scheme: dark;");
  });

  it("supports a custom prefix and Tailwind v4", () => {
    expect(toCss(small, { prefix: "ui" })).toContain("--ui-brand-100:");
    const tw = toCss(small, { tailwind: true });
    expect(tw).toMatch(/^\/\*.*\*\/\n\n@theme \{\n {2}--color-brand-100:/);
    expect(tw).toContain(":root {\n  color-scheme: light;\n}");
    expect(tw).toContain('[data-theme="light"] {');
  });
});

describe("toDtcg", () => {
  it("matches the snapshot", () => {
    expect(toDtcg(small, "dark")).toMatchSnapshot();
  });

  it("writes DTCG color tokens and role aliases", () => {
    const tokens = toDtcg(small) as any;
    const token = tokens.color.brand["200"];
    expect(token.$type).toBe("color");
    expect(token.$value.colorSpace).toBe("oklch");
    expect(token.$value.components).toHaveLength(3);
    expect(token.$value.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(token.$extensions.chromagentic.contrast).toBeGreaterThanOrEqual(token.$extensions.chromagentic.target);
    expect(tokens.color.accent).toEqual({ $type: "color", $value: "{color.brand.200}" });
    expect(tokens.color.surface.background.$value.components[0]).toBeCloseTo(1, 3);
  });

  it("uses the gamut's color space for rgb output", () => {
    const p3 = generateTheme({ colors: { brand: "#FF5A00" }, steps: true, status: false, output: { gamut: "display-p3", format: "rgb" } });
    const token = (toDtcg(p3) as any).color.brand["900"];
    expect(token.$value.colorSpace).toBe("display-p3");
    for (const c of token.$value.components) expect(c).toBeGreaterThanOrEqual(0);
  });

  it("creates one document per mode and rejects unknown modes", () => {
    expect(Object.keys(toDtcgModes(small))).toEqual(["light", "dark", "dark-high-contrast"]);
    expect(() => toDtcg(small, "nope")).toThrow(/Mode "nope" does not exist/);
  });
});

describe("platformOutput", () => {
  it("keeps the web wide-gamut, binds Apple and Android to P3, and older tech to sRGB", () => {
    expect(platformOutput("web")).toMatchObject({ gamut: "rec2020", format: "oklch" });
    expect(platformOutput("tailwind")).toMatchObject({ gamut: "rec2020", format: "oklch" });
    expect(platformOutput("swiftui")).toMatchObject({ gamut: "display-p3", format: "rgb" });
    expect(platformOutput("compose")).toMatchObject({ gamut: "display-p3", format: "rgb" });
    expect(platformOutput("email")).toMatchObject({ gamut: "srgb", format: "hex" });
    for (const platform of PLATFORMS) expect(platformOutput(platform).reason.length).toBeGreaterThan(20);
  });

  it("works directly as generateTheme output settings", () => {
    const { gamut, format } = platformOutput("legacy");
    const theme = generateTheme({ colors: { brand: "#FF5A00" }, status: false, output: { gamut, format } });
    expect(theme.modes.light.roles.accent.css).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("rejects unknown platforms", () => {
    expect(() => platformOutput("windows95" as never)).toThrow(/Unknown platform/);
  });
});

describe("toCss contrast switching", () => {
  const css = toCss(generateTheme({ colors: { brand: "#0066ff" } }));

  it("follows the system color scheme and contrast unless the page chooses", () => {
    expect(css).toContain("@media (prefers-color-scheme: dark) and (prefers-contrast: more) {\n  :root:not([data-theme]):not([data-contrast]) {");
    expect(css).toContain("@media (prefers-contrast: less) {\n  [data-theme=\"dark\"]:not([data-contrast]) {");
  });

  it("lets data-theme and data-contrast pick any of the six schemes", () => {
    expect(css).toContain('[data-theme="dark-high-contrast"], [data-theme="dark"][data-contrast="more"] {');
    expect(css).toContain('[data-theme="light-low-contrast"], [data-theme="light"][data-contrast="less"] {');
    expect(css).toContain('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme])[data-contrast="more"] {');
    expect(css).toContain(':root:not([data-theme])[data-contrast="less"] {');
  });

  it("puts dark variants after light ones so they win in dark mode", () => {
    expect(css.lastIndexOf(':root:not([data-theme])[data-contrast="more"]')).toBeGreaterThan(css.indexOf('[data-theme="dark"][data-contrast="more"]'));
    const light = css.indexOf('\n:root:not([data-theme])[data-contrast="more"]');
    const dark = css.indexOf('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme])[data-contrast="more"]');
    expect(light).toBeGreaterThan(0);
    expect(dark).toBeGreaterThan(light);
  });
});

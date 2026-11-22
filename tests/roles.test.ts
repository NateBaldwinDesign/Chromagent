import { describe, expect, it } from "vitest";
import { contrast, generateTheme, toCss, toDtcg } from "../src";
import { normalizeConfig, ThemeConfigError, type ThemeConfig } from "../src/theme/config";
import { inferKind, inferTier, pairOf } from "../src/theme/roles";
import { snapToSteps } from "../src/theme/spacing";

const srgb = { gamut: "srgb", format: "hex" } as const;
const ratio = (a: string, b: string) => contrast(a, b, "wcag2");

function problems(config: unknown) {
  try {
    normalizeConfig(config as ThemeConfig);
  } catch (error) {
    expect(error).toBeInstanceOf(ThemeConfigError);
    return (error as ThemeConfigError).problems.join("\n");
  }
  throw new Error("expected the settings to be rejected");
}

describe("role names", () => {
  it("infers kind, tier and pair from the name", () => {
    expect(["text-subtle", "icon", "border-strong", "focus-ring", "error-background", "warning", "text-on-accent", "link"].map(inferKind)).toEqual([
      "text", "icon", "border", "border", "tint", "feedback", "on", "accent",
    ]);
    expect(["text", "text-strong", "text-subtle", "heading-strongest", "link"].map(inferTier)).toEqual(["strongest", "strong", "subtle", "strongest", undefined]);
    expect(pairOf("text-on-accent")).toBe("accent");
    expect(pairOf("text")).toBeUndefined();
  });

  it("explains bad role specs in plain language", () => {
    const list = problems({
      colors: { brand: "#0066ff" },
      roles: {
        a: { kind: "nope" },
        b: { tier: "loud" },
        c: { contrast: 99 },
        d: { states: ["wiggle"] },
        "e-background": { states: ["hover"] },
        f: { color: "missing" },
        "g-on-nothing": {},
        h: 42,
        "on-x": { kind: "on" },
      },
    });
    expect(list).toMatch(/roles.a.kind must be one of/);
    expect(list).toMatch(/roles.b.tier must be one of/);
    expect(list).toMatch(/roles.c.contrast must be a contrast/);
    expect(list).toMatch(/roles.d.states must be a list/);
    expect(list).toMatch(/roles.e-background is a tint role and can't have states/);
    expect(list).toMatch(/roles.f.color "missing"/);
    expect(list).toMatch(/roles.g-on-nothing sits on "nothing"/);
    expect(list).toMatch(/roles.h must be a color reference/);
    expect(problems({ colors: { brand: "#0066ff" }, spacing: 1 })).toMatch(/spacing must be false/);
    expect(problems({ colors: { brand: "#0066ff" }, steps: "all" })).toMatch(/steps must be true/);
  });

  it("lets an explicit role win over a generated state with the same name", () => {
    const n = normalizeConfig({ colors: { brand: "#0066ff" }, roles: { "accent-hover": { contrast: 9 } } });
    expect(n.roles["accent-hover"].base).toBeUndefined();
    expect(n.roles["accent-hover"].contrast).toBe(9);
  });
});

describe("snapToSteps", () => {
  const items = [
    { id: "border", distance: 0.3, floor: 0.29 },
    { id: "subtle", distance: 0.43, floor: 0.43 },
    { id: "text", distance: 0.66, floor: 0.43 },
  ];

  it("puts every target on equal lightness steps, keeping order and floors", () => {
    const { step, distances } = snapToSteps(items, 1);
    for (const item of items) {
      expect(distances[item.id] / step).toBeCloseTo(Math.round(distances[item.id] / step), 6);
      expect(distances[item.id]).toBeGreaterThanOrEqual(item.floor - 1e-9);
    }
    expect(distances.border).toBeLessThan(distances.subtle);
    expect(distances.subtle).toBeLessThan(distances.text);
  });

  it("keeps distinct targets distinct, caps at the maximum, and honors a fixed step", () => {
    const close = snapToSteps([{ id: "a", distance: 0.3, floor: 0 }, { id: "b", distance: 0.301, floor: 0 }], 1, 0.05);
    expect(close.step).toBe(0.05);
    expect(close.distances.b - close.distances.a).toBeCloseTo(0.05, 6);
    expect(snapToSteps([{ id: "a", distance: 0.9, floor: 0 }], 0.5, 0.05).distances.a).toBe(0.5);
  });
});

describe("role-first themes", () => {
  it("outputs roles only, with no full scale", () => {
    const theme = generateTheme({ colors: { brand: "#0066ff" } });
    expect(theme.steps).toEqual([]);
    expect(theme.modes.light.scales).toEqual({});
    expect(Object.keys(theme.modes.light.roles)).toEqual(["text", "text-subtle", "border", "accent", "accent-hover", "accent-active", "text-on-accent"]);
    const css = toCss(theme);
    expect(css).toMatch(/--color-accent: oklch\(/);
    expect(css).not.toMatch(/--color-brand-/);
    expect((toDtcg(theme) as any).color.accent.$value.colorSpace).toBe("oklch");
  });

  it("keeps text tiers in order and every role above its floor in every mode", () => {
    const theme = generateTheme({
      colors: { brand: "#0066ff" },
      output: srgb,
      roles: { "text-strong": {}, icon: {} },
      modes: { light: {}, dark: { backgroundLightness: 0.1 }, "light-low-contrast": { contrastMultiplier: 0.6 } },
    });
    for (const mode of Object.values(theme.modes)) {
      const { roles, background } = mode;
      const c = (name: string) => ratio(roles[name].css, background.css);
      expect(c("text-subtle")).toBeGreaterThanOrEqual(4.5);
      expect(c("text-strong")).toBeGreaterThan(c("text-subtle"));
      expect(c("text")).toBeGreaterThan(c("text-strong"));
      expect(c("border")).toBeGreaterThanOrEqual(3);
      expect(c("icon")).toBeGreaterThanOrEqual(3);
      expect(c("accent")).toBeGreaterThanOrEqual(3);
      expect(c("accent-hover")).toBeGreaterThan(c("accent"));
      expect(c("accent-active")).toBeGreaterThan(c("accent-hover"));
      for (const surface of ["accent", "accent-hover", "accent-active"])
        expect(ratio(roles["text-on-accent"].css, roles[surface].css)).toBeGreaterThanOrEqual(4.5);
    }
    expect(theme.warnings).toEqual([]);
    expect(theme.modes.light.roles["text-on-accent"].against).toBe("accent");
  });

  it("keeps a light orange with dark text on it", () => {
    const light = generateTheme({ colors: { brand: "#FF8C00" }, output: srgb }).modes.light;
    const accent = ratio(light.roles.accent.css, light.background.css);
    expect(accent).toBeGreaterThanOrEqual(3);
    expect(accent).toBeLessThan(4);
    expect(ratio(light.roles["text-on-accent"].css, "#000000")).toBeLessThan(1.2);
  });

  it("keeps a deep purple deep, with white text on it", () => {
    const light = generateTheme({ colors: { brand: "#6d28d9" }, output: srgb }).modes.light;
    const accent = ratio(light.roles.accent.css, light.background.css);
    expect(accent).toBeGreaterThan(5.5);
    expect(accent).toBeLessThan(7.5);
    expect(light.roles["text-on-accent"].hex).toBe("#ffffff");
  });

  it("reports targets that moved to fit even spacing, and can turn spacing off", () => {
    const spaced = generateTheme({ colors: { brand: "#0066ff" } });
    expect(spaced.modes.light.spacing).toBeGreaterThan(0.03);
    expect(spaced.adjustments.length).toBeGreaterThan(0);
    for (const a of spaced.adjustments) expect(a.used).toBeGreaterThanOrEqual(a.requested * 0.9);
    const exact = generateTheme({ colors: { brand: "#0066ff" }, spacing: false, roles: { accent: { contrast: 5 } } });
    expect(exact.modes.light.spacing).toBe(0.05);
    expect(exact.modes.light.roles.accent.contrast).toBeCloseTo(5, 1);
  });

  it("supports APCA roles", () => {
    const theme = generateTheme({ colors: { brand: "#0066ff" }, formula: "apca", output: srgb });
    const { roles, background } = theme.modes.light;
    expect(Math.abs(contrast(roles["text-subtle"].css, background.css, "apca"))).toBeGreaterThanOrEqual(60);
    expect(Math.abs(contrast(roles.accent.css, background.css, "apca"))).toBeGreaterThanOrEqual(45);
  });

  it("adds status roles on request and keeps step references working", () => {
    const theme = generateTheme({ colors: { brand: "#0066ff" }, status: true, roles: { link: "brand.1000" } });
    expect(theme.steps).toEqual(["1000"]);
    expect(Object.keys(theme.modes.light.scales.brand)).toEqual(["1000"]);
    const { roles } = theme.modes.light;
    expect(roles.link.ref).toBe("brand.1000");
    expect(ratio(roles.error.css, theme.modes.light.background.css)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(roles["error-background"].css, theme.modes.light.background.css)).toBeLessThan(1.5);
    expect(toCss(theme)).toContain("--color-link: var(--color-brand-1000);");
  });

  it("falls back to the background for text on a fixed-step accent", () => {
    const n = normalizeConfig({ colors: { brand: "#0066ff" }, roles: { accent: "brand.900" } });
    expect(n.roles["text-on-accent"].ref).toBe("surface.background");
  });
});

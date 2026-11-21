import { describe, expect, it } from "vitest";
import { normalizeConfig, ThemeConfigError, type ThemeConfig } from "../src/theme/config";

function problems(config: unknown) {
  try {
    normalizeConfig(config as ThemeConfig);
  } catch (error) {
    expect(error).toBeInstanceOf(ThemeConfigError);
    return (error as ThemeConfigError).problems;
  }
  throw new Error("expected the settings to be rejected");
}

describe("normalizeConfig", () => {
  it("fills in sensible defaults from a single brand color", () => {
    const n = normalizeConfig({ colors: { brand: "#0066ff" } });
    expect(n.formula).toBe("wcag2");
    expect(n.gamut).toBe("rec2020");
    expect(n.format).toBe("oklch");
    expect(n.backgroundScale).toBe("gray");
    expect(n.scales.map((s) => s.name)).toEqual(["brand", "gray", "green", "orange", "red", "blue"]);
    expect(n.steps).toHaveLength(16);
    expect(n.steps[0]).toEqual({ name: "100", contrast: 1.06 });
    expect(n.modes.map((m) => [m.name, m.backgroundLightness, m.polarityCompensation])).toEqual([
      ["light", 1, 0.1],
      ["dark", 0.08, 0.1],
    ]);
    expect(n.defaultMode).toBe("light");
    expect(n.roles.accent).toBe("brand.900");
    expect(n.roles.text).toBe("gray.1400");
    expect(n.roles.error).toBe("red.900");
    expect(n.roles["text-on-accent"]).toBe("surface.background");
  });

  it("uses your own neutral color for the background when it has almost no chroma", () => {
    const n = normalizeConfig({ colors: { brand: "#0066ff", slate: "#64748b" } });
    expect(n.backgroundScale).toBe("gray");
    const m = normalizeConfig({ colors: { brand: "#0066ff", stone: "#777777" } });
    expect(m.backgroundScale).toBe("stone");
    expect(m.scales.some((s) => s.name === "gray")).toBe(false);
  });

  it("never picks a tinted background scale as the accent when another color exists", () => {
    const n = normalizeConfig({ colors: { slate: "#4b5563", brand: "#2563eb" }, background: { color: "slate" } });
    expect(n.roles["accent-hover"]).toMatch(/^brand\./);
    const only = normalizeConfig({ colors: { slate: "#4b5563" }, background: { color: "slate" } });
    expect(only.roles.accent).toMatch(/^slate\./);
  });

  it("infers media queries from mode names, but never for the default mode", () => {
    const n = normalizeConfig({
      colors: { brand: "#0066ff" },
      modes: {
        light: {},
        dark: { backgroundLightness: 0.1 },
        "high-contrast": { contrastMultiplier: 2 },
        "low-contrast": { contrastMultiplier: 0.7 },
        "dark-high-contrast": { backgroundLightness: 0.1, contrastMultiplier: 2 },
        sepia: { backgroundLightness: 0.9 },
        "dark-custom": { media: false },
      },
    });
    const media = Object.fromEntries(n.modes.map((m) => [m.name, m.media]));
    expect(media).toEqual({
      light: undefined,
      dark: "(prefers-color-scheme: dark)",
      "high-contrast": "(prefers-contrast: more)",
      "low-contrast": "(prefers-contrast: less)",
      "dark-high-contrast": "(prefers-color-scheme: dark) and (prefers-contrast: more)",
      sepia: undefined,
      "dark-custom": undefined,
    });
  });

  it("accepts steps as a list or as named values with opposite targets", () => {
    expect(normalizeConfig({ colors: { a: "red" }, steps: [1.5, 3, 4.5] }).steps.map((s) => s.name)).toEqual(["100", "200", "300"]);
    const named = normalizeConfig({ colors: { a: "red" }, steps: { subtle: 1.5, strong: { contrast: 4.5, opposite: 7 } } });
    expect(named.steps).toEqual([
      { name: "subtle", contrast: 1.5 },
      { name: "strong", contrast: 4.5, opposite: 7 },
    ]);
  });

  it("uses APCA steps and lets status be turned off", () => {
    const n = normalizeConfig({ colors: { brand: "#0066ff" }, formula: "apca", status: false });
    expect(n.steps.at(-1)?.contrast).toBe(105.5);
    expect(n.scales.map((s) => s.name)).toEqual(["brand", "gray"]);
    expect(n.roles.success).toBeUndefined();
  });

  it("lets a status role use your own color", () => {
    const n = normalizeConfig({ colors: { brand: "#0066ff" }, status: { danger: "#d00" } });
    expect(n.scales.find((s) => s.name === "status-danger")?.builtIn).toBe(false);
    expect(n.roles.danger).toBe("status-danger.900");
  });

  it("allows custom roles and removing defaults", () => {
    const n = normalizeConfig({ colors: { brand: "#0066ff" }, roles: { link: "brand.1000", "text-disabled": null } });
    expect(n.roles.link).toBe("brand.1000");
    expect(n.roles["text-disabled"]).toBeUndefined();
  });

  it("lists the real scale names when a role points at a missing one", () => {
    const [problem] = problems({ colors: { brand: "#0066ff" }, roles: { error: "success.900" } });
    expect(problem).toContain("Your scales are: brand, gray, green, orange, red, blue.");
  });

  it("lists every problem in plain language", () => {
    const list = problems({
      colors: { brand: "not-a-color", "bad name": "#fff" },
      formula: "nope",
      output: { gamut: "srgb", format: "cmyk" },
      steps: [0.5],
      modes: { dark: { backgroundLightness: 2, contrastMultiplier: 9 } },
      roles: { link: "brand.99999" },
      defaultMode: "missing",
    });
    expect(list.join("\n")).toMatch(/not a valid CSS color/);
    expect(list.join("\n")).toMatch(/Color name "bad name"/);
    expect(list.join("\n")).toMatch(/formula must be/);
    expect(list.join("\n")).toMatch(/output.format must be/);
    expect(list.join("\n")).toMatch(/backgroundLightness/);
    expect(list.join("\n")).toMatch(/contrastMultiplier/);
    expect(list.join("\n")).toMatch(/defaultMode "missing"/);
    expect(list.join("\n")).toMatch(/roles.link/);
  });

  it("rejects empty or missing settings", () => {
    expect(problems(null)).toEqual(["The theme settings must be an object."]);
    expect(problems({ colors: {} }).join()).toMatch(/at least one named color/);
    expect(problems({ colors: { a: [] } }).join()).toMatch(/at least one key color/);
    expect(problems({ colors: { a: "red" }, steps: [] }).join()).toMatch(/at least one contrast/);
    expect(problems({ colors: { a: "red" }, modes: {} }).join()).toMatch(/at least one mode/);
  });

  it("rejects hex output with wide gamuts and name collisions", () => {
    expect(problems({ colors: { a: "red" }, output: { format: "hex" } }).join()).toMatch(/only works with output.gamut "srgb"/);
    expect(problems({ colors: { text: "red" } }).join()).toMatch(/The name "text" is used by both/);
  });

  it("rejects bad surfaces", () => {
    const list = problems({
      colors: { a: "red" },
      surfaces: { background: { contrast: 1.1 }, card: { contrast: 1.1, reference: "side", color: "nope" }, x: "y" },
    }).join("\n");
    expect(list).toMatch(/base surface/);
    expect(list).toMatch(/reference must be/);
    expect(list).toMatch(/surfaces.card.color/);
    expect(list).toMatch(/must be an object/);
  });
});

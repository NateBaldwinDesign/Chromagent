import { statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { personalize, personalizeTheme, personalizedVariables } from "../src/runtime";
import { generateTheme } from "../src/theme/generateTheme";
import { toCss } from "../src/output/css";
import type { ThemeConfig } from "../src/theme/config";

const config: ThemeConfig = { colors: { gray: "#6b7280", brand: "#2563eb" }, background: { color: "gray" } };

function fakeElement() {
  const props: Record<string, string> = {};
  return { props, style: { setProperty: (name: string, value: string) => void (props[name] = value) } };
}

describe("personalization runtime", () => {
  it("uses the same variable names as the static CSS", () => {
    const vars = personalizedVariables(config, {});
    const css = toCss(generateTheme(config));
    for (const name of Object.keys(vars).filter((n) => n.startsWith("--"))) expect(css).toContain(`${name}:`);
    expect(vars["color-scheme"]).toBe("light");
  });

  it("follows the chosen background lightness and keeps text readable", () => {
    const dark = personalizeTheme(config, { backgroundLightness: 0.15 }).modes.personal;
    expect(dark.settings.backgroundLightness).toBe(0.15);
    expect(dark.roles.text.contrast).toBeGreaterThanOrEqual(4.5);
    expect(personalizedVariables(config, { backgroundLightness: 0.15 })["color-scheme"]).toBe("dark");
  });

  it("raises contrast on request and never drops text below its floor", () => {
    const more = personalizeTheme(config, { contrast: 1.6 }).modes.personal.roles;
    const regular = personalizeTheme(config, {}).modes.personal.roles;
    const less = personalizeTheme(config, { contrast: 0.5 }).modes.personal.roles;
    expect(more.border.contrast).toBeGreaterThan(regular.border.contrast);
    expect(less["text-subtle"].contrast).toBeGreaterThanOrEqual(4.5);
    expect(less.border.contrast).toBeGreaterThanOrEqual(3);
  });

  it("keeps out-of-range choices inside safe limits", () => {
    const mode = personalizeTheme(config, { backgroundLightness: 3, contrast: 9 }).modes.personal;
    expect(mode.settings.backgroundLightness).toBe(1);
    expect(mode.settings.contrastMultiplier).toBe(2);
  });

  it("writes variables onto the given element, with a custom prefix", () => {
    const el = fakeElement();
    const vars = personalize(config, { backgroundLightness: 0.1 }, el, { prefix: "ui" });
    expect(el.props["--ui-text"]).toBe(vars["--ui-text"]);
    expect(el.props["color-scheme"]).toBe("dark");
  });

  it("uses the page root by default and explains when there is none", () => {
    expect(() => personalize(config, {})).toThrow(/needs a target element/);
    const el = fakeElement();
    (globalThis as { document?: unknown }).document = { documentElement: el };
    try {
      personalize(config, {});
      expect(el.props["--color-text"]).toBeDefined();
    } finally {
      delete (globalThis as { document?: unknown }).document;
    }
  });

  it("ships a browser copy in the skill that stays under 100 KB", async () => {
    const file = "skills/chromagentic/scripts/chromagentic-runtime.mjs";
    expect(statSync(file).size).toBeLessThan(100 * 1024);
    const bundled = (await import(pathToFileURL(file).href)) as typeof import("../src/runtime");
    expect(bundled.personalizedVariables(config, {})["--color-text"]).toBe(personalizedVariables(config, {})["--color-text"]);
  });
});

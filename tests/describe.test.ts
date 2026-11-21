import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { describeColor, promptWords, stem, suggestColors } from "../src/describe/describe";

describe("suggestColors", () => {
  it("returns vivid, high-chroma colors for 'vivid'", () => {
    const { colors } = suggestColors("vivid");
    expect(colors.length).toBeGreaterThanOrEqual(4);
    for (const color of colors) {
      expect(color.oklch[1]).toBeGreaterThanOrEqual(0.12);
      expect(color.matched).toEqual(["vivid"]);
    }
  });

  it("returns light, low-chroma colors for 'pale'", () => {
    const { colors } = suggestColors("pale");
    expect(colors.length).toBeGreaterThanOrEqual(3);
    for (const color of colors) {
      expect(color.oklch[0]).toBeGreaterThanOrEqual(0.75);
      expect(color.oklch[1]).toBeLessThanOrEqual(0.09);
    }
  });

  it("matches several words and ranks colors that match all of them first", () => {
    const result = suggestColors("Make a website with bright vivid colors");
    expect(result.matchedWords).toEqual(["bright", "vivid"]);
    expect(result.colors[0].matched).toEqual(["bright", "vivid"]);
  });

  it("handles word forms like 'earthy' and 'calming'", () => {
    const result = suggestColors("calming and earthy");
    expect(result.unmatchedWords).toEqual([]);
    expect(result.colors[0].matched).toEqual(["calming", "earthy"]);
  });

  it("keeps every suggestion inside sRGB and visibly different", () => {
    const { colors } = suggestColors("bright vivid", { count: 8 });
    expect(colors).toHaveLength(8);
    for (const color of colors) {
      expect(new Color(color.css).inGamut("srgb")).toBe(true);
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (let i = 0; i < colors.length; i += 1)
      for (let j = i + 1; j < colors.length; j += 1)
        expect(new Color(colors[i].css).deltaE(colors[j].css, "OK")).toBeGreaterThan(0.06);
  });

  it("returns a clear, empty result for unknown words", () => {
    expect(suggestColors("xyzzy qwerty")).toEqual({ colors: [], matchedWords: [], unmatchedWords: ["xyzzy", "qwerty"] });
    expect(suggestColors("")).toEqual({ colors: [], matchedWords: [], unmatchedWords: [] });
  });

  it("is deterministic", () => {
    expect(suggestColors("luxury")).toEqual(suggestColors("luxury"));
  });
});

describe("describeColor", () => {
  it("describes a color in plain words", () => {
    const words = describeColor("#FF5A00");
    expect(words.summary).toBe("bright, vivid and brilliant");
    expect(words.nouns).toContain("orange");
    expect(words.temperature.join()).toMatch(/warm/);
    expect(words.meanings.length).toBeGreaterThan(0);
  });

  it("accepts wide-gamut colors", () => {
    expect(describeColor("color(display-p3 0 1 0)").words).toContain("vivid");
    expect(describeColor("oklch(90% 0.04 250)").summary).toMatch(/pale|light|soft/);
  });
});

describe("prompt helpers", () => {
  it("drops filler words", () => {
    expect(promptWords("Give my app a calm, earthy feel")).toEqual(["calm", "earthy"]);
  });

  it("stems common endings", () => {
    expect(stem("calming")).toBe("calm");
    expect(stem("earthy")).toBe("earth");
    expect(stem("red")).toBe("red");
  });
});

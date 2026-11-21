import Color from "colorjs.io";
import { describe, expect, it } from "vitest";
import { apcaContrast, apcaFromLuminance, apcaLuminance, MAX_APCA } from "../src/math/apca";
import { contrast, wcagContrast } from "../src/math/contrast";

const pairs: [string, string][] = [
  ["#000000", "#ffffff"],
  ["#ffffff", "#000000"],
  ["#888888", "#ffffff"],
  ["#1a5fb4", "#f6f5f4"],
  ["#e5a50a", "#241f31"],
  ["#767676", "#ffffff"],
  ["color(display-p3 0.2 0.6 0.3)", "#ffffff"],
];

describe("APCA", () => {
  it.each(pairs)("matches colorjs.io for %s on %s", (text, bg) => {
    const expected = new Color(bg).contrast(new Color(text), "APCA");
    expect(apcaContrast(text, bg, false)).toBeCloseTo(expected, 6);
  });

  it("matches the published APCA reference values", () => {
    // Values from the APCA README (0.0.98G): #888 on #fff is Lc 63.06, #fff on #888 is Lc -68.54.
    expect(apcaContrast("#888888", "#ffffff", false)).toBeCloseTo(63.06, 1);
    expect(apcaContrast("#ffffff", "#888888", false)).toBeCloseTo(-68.54, 1);
    expect(apcaContrast("#000000", "#ffffff", false)).toBeCloseTo(106.04, 1);
  });

  it("is negative for light text on dark backgrounds", () => {
    expect(apcaContrast("#ffffff", "#000000")).toBeLessThan(0);
    expect(apcaContrast("#000000", "#ffffff")).toBeGreaterThan(0);
  });

  it("official mode reports 0 for very low contrast; smooth mode keeps growing", () => {
    expect(apcaContrast("#fafafa", "#ffffff", false)).toBe(0);
    const smooth = apcaContrast("#fafafa", "#ffffff");
    expect(smooth).toBeGreaterThan(0);
    expect(smooth).toBeLessThan(7.3);
    expect(apcaFromLuminance(0.5, 0.5)).toBe(0);
  });

  it("smooth mode is continuous at the low clip", () => {
    const bgY = apcaLuminance([1, 1, 1]);
    let previous = 0;
    for (let y = 1; y >= 0.7; y -= 0.002) {
      const lc = apcaFromLuminance(y, bgY);
      expect(lc).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(lc - previous).toBeLessThan(1);
      previous = lc;
    }
  });

  it("never exceeds the maximum", () => {
    expect(Math.abs(apcaContrast("#000", "#fff"))).toBeLessThanOrEqual(MAX_APCA);
  });
});

describe("contrast()", () => {
  it("uses WCAG 2 by default and matches colorjs.io", () => {
    expect(contrast("#767676", "#ffffff")).toBeCloseTo(new Color("#767676").contrast("#ffffff", "WCAG21"), 6);
    expect(wcagContrast("#000", "#fff")).toBeCloseTo(21, 6);
    expect(wcagContrast("#fff", "#fff")).toBeCloseTo(1, 6);
  });

  it("returns APCA as a positive Lc", () => {
    expect(contrast("#ffffff", "#000000", "apca")).toBeGreaterThan(100);
  });
});

import { describe, expect, it } from "vitest";
import { deltaE2000, MACHADO, simulateCvd } from "../src/math/cvd";
import { checkCvd, FEEDBACK_HUES, harmonizeFeedback, separateFeedback, type Oklch } from "../src/theme/feedbackHues";
import { feedbackColors } from "../src/theme/feedbackColors";
import { generateTheme } from "../src/theme/generateTheme";
import { gamutClamp } from "../src/math/colorMath";
import { run } from "../src/cli/run";

describe("deltaE2000", () => {
  // Sharma, Wu & Dalal (2005) test data.
  it.each([
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ])("matches the reference value for %j vs %j", (a, b, expected) => {
    expect(deltaE2000(a as [number, number, number], b as [number, number, number])).toBeCloseTo(expected, 4);
  });

  it("is symmetric and zero for identical colors", () => {
    expect(deltaE2000([40, 20, -10], [40, 20, -10])).toBe(0);
    expect(deltaE2000([40, 20, -10], [60, -5, 30])).toBeCloseTo(deltaE2000([60, -5, 30], [40, 20, -10]), 10);
  });
});

describe("simulateCvd", () => {
  it("applies the Machado 2009 full-severity matrices to linear sRGB", () => {
    expect(simulateCvd([1, 0, 0], "protan")).toEqual([0.152286, 0.114503, 0]);
    expect(simulateCvd([0, 1, 0], "deutan")).toEqual([0.860646, 0.672501, 0.04294]);
    expect(simulateCvd([0, 0, 1], "tritan")[2]).toBeCloseTo(0.3039, 6);
    expect(MACHADO.deutan[0][0]).toBe(0.367322);
  });

  it("leaves typical vision alone and keeps results in range", () => {
    expect(simulateCvd([0.2, 0.4, 0.6], "normal")).toEqual([0.2, 0.4, 0.6]);
    for (const value of simulateCvd([1, 1, 0], "tritan")) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("makes red and green look alike for deutan vision", () => {
    const plain = checkCvd({ red: "#d32f2f", green: "#388e3c" });
    expect(plain.worst?.vision).not.toBe("normal");
    expect(plain.pass).toBe(false);
  });
});

describe("harmonizeFeedback", () => {
  it("keeps every hue in its recognizable range and matches the brand's chroma", () => {
    for (const brand of ["#0066ff", "#ff7a00", "#5b2a86", "#888888"]) {
      const colors = harmonizeFeedback(brand);
      for (const [name, [, c, h]] of Object.entries(colors)) {
        const [lo, hi] = FEEDBACK_HUES[name];
        expect(h).toBeGreaterThanOrEqual(lo);
        expect(h).toBeLessThanOrEqual(hi);
        expect(c).toBeGreaterThanOrEqual(0.08);
      }
    }
    expect(harmonizeFeedback("oklch(0.6 0.2 264)").info[1]).toBeCloseTo(0.2, 4);
  });

  it("uses hues on a 30° harmony with the brand", () => {
    const brandHue = 264;
    for (const [, , h] of Object.values(harmonizeFeedback(`oklch(0.6 0.2 ${brandHue})`))) {
      const offset = (((h - brandHue) % 30) + 30) % 30;
      expect(Math.min(offset, 30 - offset)).toBeLessThan(0.01);
    }
  });

  it("skips names it has no hue range for", () => {
    expect(Object.keys(harmonizeFeedback("#0066ff", ["error", "brand"]))).toEqual(["error"]);
  });
});

describe("separateFeedback", () => {
  const realize = ([l, c, h]: Oklch) => gamutClamp(l, c, h);
  const start: Record<string, Oklch> = { error: [0.6, 0.18, 28], success: [0.6, 0.18, 145] };

  it("moves lightness until red and green pass every simulation", () => {
    const result = separateFeedback(start, { realize, accepts: () => true });
    expect(result.report.pass).toBe(true);
    expect(result.changed.length).toBeGreaterThan(0);
    expect(result.colors.error[2]).toBe(28);
  });

  it("reports a failure when limits block every move", () => {
    const result = separateFeedback(start, { realize, accepts: () => false });
    expect(result.report.pass).toBe(false);
    expect(result.report.failing.length).toBeGreaterThan(0);
    expect(result.changed).toEqual([]);
  });

  it("falls back to hue and chroma when lightness is locked", () => {
    const result = separateFeedback(
      { error: [0.6, 0.18, 30], warning: [0.6, 0.18, 60] },
      { realize, accepts: (_, [l]) => Math.abs(l - 0.6) < 1e-9, required: 8 },
    );
    expect(result.colors.error[0]).toBe(0.6);
    expect(result.colors.warning[0]).toBe(0.6);
    expect(result.changed.length).toBeGreaterThan(0);
  });
});

describe("feedback colors in themes", () => {
  const brands = ["#0066ff", "#ff7a00", "#5b2a86"];

  it.each(brands)("keeps every feedback pair distinct and readable in all six modes (brand %s)", (brand) => {
    const result = feedbackColors(brand);
    expect(Object.keys(result.modes)).toHaveLength(6);
    expect(result.warnings).toEqual([]);
    for (const mode of Object.values(result.modes)) {
      expect(mode.check?.pass).toBe(true);
      expect(mode.check!.worst!.deltaE).toBeGreaterThanOrEqual(11);
      for (const color of Object.values(mode.colors)) expect(color.contrast).toBeGreaterThanOrEqual(4.5);
      const independent = checkCvd(Object.fromEntries(Object.entries(mode.colors).map(([k, v]) => [k, v.css])));
      expect(independent.worst!.deltaE).toBeGreaterThan(10.5);
    }
  }, 20000);

  it.each(["#ff5a00", "#e8590c", "#ff3b30"])("keeps error red, not brown or peach, for warm brands (%s)", (brand) => {
    for (const mode of Object.values(feedbackColors(brand).modes)) {
      const [lightness] = mode.colors.error.oklch;
      expect(lightness).toBeGreaterThanOrEqual(0.4);
      expect(lightness).toBeLessThanOrEqual(0.85);
    }
  }, 20000);

  it("keeps a brand-free or explicit set of status colors and still checks them", () => {
    const theme = generateTheme({ colors: { gray: "#777" }, status: true, modes: { light: {} } });
    expect(theme.modes.light.feedback?.pass).toBe(true);
    const custom = generateTheme({
      colors: { brand: "#0066ff" },
      status: { error: "#ff0000", success: "#ff1000" },
      modes: { light: {} },
    });
    expect(custom.modes.light.feedback).toBeDefined();
  });

  it("warns when the colors can't be pulled apart, and --strict fails", () => {
    const config = {
      colors: { brand: "#0066ff" },
      status: { error: "#ff0000", warning: "#ff0800" },
      roles: { error: { color: "status-error", min: 19 }, warning: { color: "status-warning", min: 19 } },
      modes: { light: {} },
    };
    const theme = generateTheme(config);
    expect(theme.modes.light.feedback?.pass).toBe(false);
    expect(theme.warnings.join(" ")).toMatch(/too similar/);
  });

  it("leaves full-scale themes on the classic status colors", () => {
    const theme = generateTheme({ colors: { brand: "#0066ff" }, steps: true, modes: { light: {} } });
    expect(theme.modes.light.scales.red).toBeDefined();
  });
});

describe("CLI feedback and check-cvd", () => {
  const io = () => {
    const out = { stdout: "", stderr: "" };
    return { out, io: { stdout: (t: string) => (out.stdout += t), stderr: (t: string) => (out.stderr += t), cwd: process.cwd() } };
  };

  it("prints feedback colors for each mode", async () => {
    const { out, io: cli } = io();
    expect(await run(["feedback", "#0066ff", "--formula", "wcag2"], cli)).toBe(0);
    const modes = JSON.parse(out.stdout);
    expect(modes.light.colors.error.css).toMatch(/^oklch/);
    expect(modes.dark.check.pass).toBe(true);
  }, 20000);

  it("explains bad feedback input", async () => {
    const { out, io: cli } = io();
    expect(await run(["feedback"], cli)).toBe(2);
    expect(await run(["feedback", "#06f", "--formula", "x"], cli)).toBe(2);
    expect(await run(["feedback", "notacolor"], cli)).toBe(2);
    expect(out.stderr).toMatch(/brand color/);
  });

  it("checks named and unnamed colors and exits 3 when too close", async () => {
    const pass = io();
    expect(await run(["check-cvd", "error=#b00020", "info=#0057d9", "--min", "5"], pass.io)).toBe(0);
    expect(JSON.parse(pass.out.stdout).pass).toBe(true);
    const fail = io();
    expect(await run(["check-cvd", "#d32f2f", "#388e3c"], fail.io)).toBe(3);
    expect(JSON.parse(fail.out.stdout).failing[0].a).toBe("color1");
    expect(fail.out.stderr).toMatch(/too similar/);
  });

  it("explains bad check-cvd input", async () => {
    const { out, io: cli } = io();
    expect(await run(["check-cvd", "#fff"], cli)).toBe(2);
    expect(await run(["check-cvd", "#fff", "#000", "--min", "0"], cli)).toBe(2);
    expect(await run(["check-cvd", "a=nope", "b=#000"], cli)).toBe(2);
    expect(out.stderr).toMatch(/two or more|--min|CSS color/);
  });
});

/**
 * A color-blindness check for grading, kept separate from the engine so the eval doesn't grade the
 * engine with its own code. Uses the published Machado, Oliveira & Fernandes (2009) matrices at full
 * severity on linear sRGB, and colorjs.io's CIEDE2000 on D65 Lab.
 */
import Color from "colorjs.io";

type Row = [number, number, number];
const MATRICES: Record<"protanopia" | "deuteranopia" | "tritanopia", [Row, Row, Row]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** The color as seen with each kind of vision: typical, then the three dichromacies. */
export function visions(color: Color): Color[] {
  const linear = color.to("srgb").toGamut().to("srgb-linear").coords.map((v) => clamp(Number(v) || 0)) as Row;
  const seen = Object.values(MATRICES).map(
    (m) => new Color("srgb-linear", m.map((row) => clamp(row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2])) as Row),
  );
  return [new Color("srgb-linear", linear), ...seen];
}

/**
 * CIEDE2000 on D65 Lab, the usual white point for sRGB screens. colorjs.io measures in D50 Lab, so the
 * D65 coordinates are handed to it as plain Lab to skip its conversion.
 */
const deltaE = (a: Color, b: Color) => Color.deltaE(new Color("lab", a.to("lab-d65").coords), new Color("lab", b.to("lab-d65").coords), "2000");

/** How many of the pairs × visions fall below `required` CIEDE2000 apart, out of how many checked. */
export function cvdFailures(colors: Color[], required = 11): { failing: number; total: number } {
  const seen = colors.map(visions);
  let failing = 0;
  let total = 0;
  for (let i = 0; i < seen.length; i++)
    for (let j = i + 1; j < seen.length; j++)
      for (let v = 0; v < seen[i].length; v++) {
        total++;
        if (deltaE(seen[i][v], seen[j][v]) < required) failing++;
      }
  return { failing, total };
}

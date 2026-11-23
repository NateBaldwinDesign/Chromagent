import { clamp01 as clamp, linearToXyzD65, type LinearRgb } from "./colorMath";

/** Color vision used for checks: typical vision plus the three dichromacies (monochromacy is not checked). */
export type Vision = "normal" | "protan" | "deutan" | "tritan";
export const VISIONS: Vision[] = ["normal", "protan", "deutan", "tritan"];

type Matrix = readonly [LinearRgb, LinearRgb, LinearRgb];

/** Machado, Oliveira & Fernandes (2009) simulation matrices at full severity, for linear sRGB. */
export const MACHADO: Record<Exclude<Vision, "normal">, Matrix> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};


/** Simulates how a linear sRGB color looks with a color vision deficiency. Results are clamped to sRGB. */
export function simulateCvd(color: LinearRgb, vision: Vision): LinearRgb {
  const input: LinearRgb = [clamp(color[0]), clamp(color[1]), clamp(color[2])];
  if (vision === "normal") return input;
  const m = MACHADO[vision];
  return m.map((row) => clamp(row[0] * input[0] + row[1] * input[1] + row[2] * input[2])) as unknown as LinearRgb;
}

const D65 = linearToXyzD65([1, 1, 1]);
const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** CIELAB (D65 white) of a linear sRGB color. */
export function labOfLinear(color: LinearRgb): LinearRgb {
  const [x, y, z] = linearToXyzD65(color).map((v, i) => labF(v / D65[i]));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const rad = Math.PI / 180;

/** CIEDE2000 color difference (Sharma, Wu & Dalal 2005). About 2.3 is just noticeable; 11+ reads as clearly different. */
export function deltaE2000([l1, a1, b1]: LinearRgb, [l2, a2, b2]: LinearRgb) {
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const ap1 = a1 * (1 + g);
  const ap2 = a2 * (1 + g);
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const hueOf = (b: number, a: number) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const hp1 = hueOf(b1, ap1);
  const hp2 = hueOf(b2, ap2);
  const dL = l2 - l1;
  const dC = cp2 - cp1;
  let dh = 0;
  if (cp1 * cp2 !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh / 2) * rad);
  const lBar = (l1 + l2) / 2;
  const cBar = (cp1 + cp2) / 2;
  let hBar = hp1 + hp2;
  if (cp1 * cp2 !== 0) {
    if (Math.abs(hp1 - hp2) <= 180) hBar = (hp1 + hp2) / 2;
    else hBar = hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((hBar - 30) * rad) +
    0.24 * Math.cos(2 * hBar * rad) +
    0.32 * Math.cos((3 * hBar + 6) * rad) -
    0.2 * Math.cos((4 * hBar - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const cBarP7 = cBar ** 7;
  const rc = 2 * Math.sqrt(cBarP7 / (cBarP7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBar;
  const sh = 1 + 0.015 * cBar * t;
  const rt = -Math.sin(2 * dTheta * rad) * rc;
  return Math.sqrt(
    (dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh),
  );
}

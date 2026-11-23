import Color from "../math/color";
import type { LinearRgb } from "../math/colorMath";
import { deltaE2000, labOfLinear, simulateCvd, VISIONS, type Vision } from "../math/cvd";

export type Oklch = [number, number, number];

/** OKLCH hue ranges where each feedback color stays recognizable. */
export const FEEDBACK_HUES: Record<string, [number, number]> = {
  error: [10, 45],
  warning: [50, 100],
  success: [125, 165],
  info: [225, 265],
};
/** Natural OKLCH lightness for each feedback key color (yellows only get vivid when light). */
const FEEDBACK_LIGHTNESS: Record<string, number> = { error: 0.6, warning: 0.78, success: 0.65, info: 0.6 };
/**
 * OKLCH lightness where each feedback color still reads as itself: darker reds and oranges turn brown,
 * and lighter reds turn peach. Greens and blues keep a wider range, since dark green still reads as green
 * and lightness is often the only difference color-blind users can see. The CVD search stays inside these.
 */
const FEEDBACK_LIGHTNESS_RANGE: Record<string, [number, number]> = {
  error: [0.4, 0.85],
  warning: [0.3, 0.95],
  success: [0.2, 0.98],
  info: [0.2, 0.98],
};
const lightEnough = (name: string, lightness: number) => {
  const [lo, hi] = FEEDBACK_LIGHTNESS_RANGE[name] ?? [0.02, 0.98];
  return lightness >= lo && lightness <= hi;
};
/** Every feedback pair must differ by at least this CIEDE2000 value, in typical vision and each simulation. */
export const MIN_FEEDBACK_DELTA_E = 11;
const MIN_CHROMA = 0.08;
const MAX_CHROMA = 0.3;

const wrap = (hue: number) => ((hue % 360) + 360) % 360;

/**
 * Feedback key colors that harmonize with a brand color: the brand's chroma, and hues on a 30° harmony
 * lattice around the brand hue, picking the lattice hue nearest the middle of each feedback range.
 */
export function harmonizeFeedback(brand: string, names: string[] = Object.keys(FEEDBACK_HUES)): Record<string, Oklch> {
  const [, c, h] = new Color(brand).to("oklch").coords.map((v) => Number(v) || 0);
  const chroma = Math.min(MAX_CHROMA, Math.max(MIN_CHROMA, c));
  const result: Record<string, Oklch> = {};
  for (const name of names) {
    const range = FEEDBACK_HUES[name];
    if (!range) continue;
    const center = (range[0] + range[1]) / 2;
    let best = center;
    let bestDistance = Infinity;
    for (let n = 0; n < 12; n += 1) {
      const hue = wrap(h + n * 30);
      const distance = Math.abs(hue - center);
      if (hue >= range[0] && hue <= range[1] && distance < bestDistance) [best, bestDistance] = [hue, distance];
    }
    result[name] = [FEEDBACK_LIGHTNESS[name], chroma, Number(best.toFixed(2))];
  }
  return result;
}

export interface CvdPair {
  a: string;
  b: string;
  vision: Vision;
  deltaE: number;
}

export interface CvdReport {
  /** True when every pair differs by at least `required` in every vision. */
  pass: boolean;
  required: number;
  /** The smallest difference found, and where. */
  worst?: CvdPair;
  /** Every pair that is too close. */
  failing: CvdPair[];
}

function report(labs: Record<string, Record<Vision, LinearRgb>>, required: number): CvdReport {
  const names = Object.keys(labs);
  const failing: CvdPair[] = [];
  let worst: CvdPair | undefined;
  for (let i = 0; i < names.length; i += 1)
    for (let j = i + 1; j < names.length; j += 1)
      for (const vision of VISIONS) {
        const deltaE = Number(deltaE2000(labs[names[i]][vision], labs[names[j]][vision]).toFixed(2));
        const pair = { a: names[i], b: names[j], vision, deltaE };
        if (!worst || deltaE < worst.deltaE) worst = pair;
        if (deltaE < required) failing.push(pair);
      }
  return { pass: failing.length === 0, required, ...(worst && { worst }), failing };
}

const visionLabs = (linear: LinearRgb) =>
  Object.fromEntries(VISIONS.map((v) => [v, labOfLinear(simulateCvd(linear, v))])) as Record<Vision, LinearRgb>;

/** Checks that named colors stay distinct (CIEDE2000) in typical vision and protan, deutan, and tritan simulations. */
export function checkCvd(colors: Record<string, string>, required = MIN_FEEDBACK_DELTA_E): CvdReport {
  const labs: Record<string, Record<Vision, LinearRgb>> = {};
  for (const [name, css] of Object.entries(colors)) {
    const linear = new Color(css).to("srgb-linear").coords.map((v) => Number(v) || 0) as unknown as LinearRgb;
    labs[name] = visionLabs(linear);
  }
  return report(labs, required);
}

export interface SeparateOptions {
  /** Turns OKLCH into linear sRGB (gamut-mapped as it will be shown). */
  realize: (oklch: Oklch) => LinearRgb;
  /** False when a candidate breaks a limit, such as its contrast floor. */
  accepts: (name: string, oklch: Oklch) => boolean;
  /** Lightness move size (OKLCH L). Default 0.05, the even-spacing step. */
  lightnessStep?: number;
  required?: number;
  maxMoves?: number;
}

export interface SeparateResult {
  colors: Record<string, Oklch>;
  report: CvdReport;
  /** Names of colors that were changed. */
  changed: string[];
}

const minDeltaE = (a: Record<Vision, LinearRgb>, b: Record<Vision, LinearRgb>) =>
  Math.min(...VISIONS.map((v) => deltaE2000(a[v], b[v])));

/**
 * Finds lightness values (on the even-spacing grid) that keep every pair apart, with the smallest total
 * change. If none passes, returns the combination with the largest smallest difference.
 */
function searchLightness(start: Record<string, Oklch>, options: SeparateOptions, step: number, required: number) {
  const names = Object.keys(start);
  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6].filter((v, i, a) => a.indexOf(v) === i);
  const options_ = names.map((name) =>
    offsets
      .map((k) => {
        const [l, c, h] = start[name];
        const value: Oklch = [l + k * step, c, h];
        return { k, value };
      })
      .filter(({ k, value }) => k === 0 || (lightEnough(name, value[0]) && value[0] > 0.02 && value[0] < 0.98 && options.accepts(name, value)))
      .map(({ k, value }) => ({ k, value, labs: visionLabs(options.realize(value)) })),
  );
  // Pairwise smallest difference for every lightness choice, computed once.
  const table = new Map<string, number>();
  const pairMin = (i: number, a: number, j: number, b: number) => {
    const key = `${i}.${a}.${j}.${b}`;
    let value = table.get(key);
    if (value === undefined) table.set(key, (value = minDeltaE(options_[i][a].labs, options_[j][b].labs)));
    return value;
  };
  let best: { pick: number[]; pass: boolean; cost: number; min: number } | undefined;
  const pick: number[] = [];
  const walk = (index: number, min: number, cost: number) => {
    if (best?.pass && cost >= best.cost) return;
    if (index === names.length) {
      const pass = min >= required;
      if (!best || (pass && (!best.pass || cost < best.cost)) || (!pass && !best.pass && min > best.min))
        best = { pick: [...pick], pass, cost, min };
      return;
    }
    for (let a = 0; a < options_[index].length; a += 1) {
      let m = min;
      for (let j = 0; j < index; j += 1) m = Math.min(m, pairMin(j, pick[j], index, a));
      // Once a passing set exists, branches that already fail can't beat it.
      if (best?.pass && m < required) continue;
      pick[index] = a;
      walk(index + 1, m, cost + Math.abs(options_[index][a].k));
    }
  };
  walk(0, Infinity, 0);
  return Object.fromEntries(names.map((name, i) => [name, options_[i][best!.pick[i]].value]));
}

/**
 * Nudges feedback colors apart until every pair passes the CVD check. Changes lightness first
 * (the smallest total change on the even-spacing grid), then hue inside each color's recognizable
 * range, then chroma.
 */
export function separateFeedback(start: Record<string, Oklch>, options: SeparateOptions): SeparateResult {
  const required = options.required ?? MIN_FEEDBACK_DELTA_E;
  const step = options.lightnessStep ?? 0.05;
  const colors: Record<string, Oklch> = searchLightness(start, options, step, required);
  const labs: Record<string, Record<Vision, LinearRgb>> = {};
  for (const [name, value] of Object.entries(colors)) labs[name] = visionLabs(options.realize(value));
  const shortfall = (set: typeof labs) =>
    report(set, required).failing.reduce((sum, pair) => sum + (required - pair.deltaE), 0);
  const ranges = (name: string): [number, number] => FEEDBACK_HUES[name] ?? [start[name][2] - 15, start[name][2] + 15];

  let current = shortfall(labs);
  for (let move = 0; move < (options.maxMoves ?? 60) && current > 0; move += 1) {
    const involved = new Set(report(labs, required).failing.flatMap((p) => [p.a, p.b]));
    let applied = false;
    for (const kind of ["hue", "chroma", "lightness"] as const) {
      let best: { name: string; value: Oklch; labs: Record<Vision, LinearRgb>; score: number } | undefined;
      for (const name of involved) {
        const [l, c, h] = colors[name];
        const [lo, hi] = ranges(name);
        const candidates: Oklch[] =
          kind === "hue"
            ? [[l, c, h + 4], [l, c, h - 4]]
            : kind === "chroma"
              ? [[l, c * 1.1, h], [l, c * 0.9, h]]
              : [[l + step / 2, c, h], [l - step / 2, c, h]];
        for (const value of candidates) {
          if (value[0] <= 0.02 || value[0] >= 0.98 || !lightEnough(name, value[0]) || value[2] < lo || value[2] > hi || value[1] < 0.03) continue;
          if (!options.accepts(name, value)) continue;
          const trial = { ...labs, [name]: visionLabs(options.realize(value)) };
          const score = shortfall(trial);
          if (score < current - 1e-6 && (!best || score < best.score)) best = { name, value, labs: trial[name], score };
        }
      }
      if (best) {
        colors[best.name] = best.value;
        labs[best.name] = best.labs;
        current = best.score;
        applied = true;
        break;
      }
    }
    if (!applied) break;
  }
  const changed = Object.keys(colors).filter((name) => colors[name].some((v, i) => Math.abs(v - start[name][i]) > 1e-9));
  return { colors, report: report(labs, required), changed };
}

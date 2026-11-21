import { writeFileSync } from "node:fs";
import { buildScaleData, resolveScaleColorAtLightness } from "./scaleGeneration";
import { generateColors } from "./dynamicGeneration";
import { compensatedContrast, effectiveContrast, multiplyContrast, polarityWeight, backgroundLuminance, applyPolarityCompensation, applyContrastMultiplier } from "./polarity";
import { surfaceLinear } from "./surfaceGeneration";
import { outputColorCss, gamutClamp, linearToOklch, luminance } from "./colorMath";
import type { ColorScale, ColorSystemDocument } from "./model";
import type { ColorOutputSettings } from "./outputSettings";

const CONTRASTS = [1.06, 1.15, 1.32, 1.6, 2, 2.6, 3.22, 3.95, 4.79, 6.29, 7.9, 10, 12.3, 14.8, 17, 19.5];
const SCALES: Record<string, [number, number, number][]> = {
  gray: [[0.5692623996686854, 0, 0]],
  red: [[0.675, 30.1, 53.3], [0.5779, 30.4, 51.1], [0.3001, 31.5, 25.5]],
  yellow: [[0.8681, 94.1, 44.5], [0.6102, 73.5, 32.4]],
  green: [[0.7335, 154.2, 44.5], [0.3528, 165.7, 18.4], [0.9011, 156.6, 20]],
  blue: [[0.7893, 258.6, 25.6], [0.5335, 266.7, 59.7], [0.3224, 265.9, 38.9], [0.2409, 268.7, 21.8]],
  vivid: [[0.62, 30, 100]],
};
const OUTPUTS: Record<string, ColorOutputSettings> = {
  "srgb-rgb": { authoringGamut: "srgb", outputFormat: "rgb", mapOutputsToSrgb: false },
  "srgb-hex": { authoringGamut: "srgb", outputFormat: "hex", mapOutputsToSrgb: false },
  "srgb-oklch": { authoringGamut: "srgb", outputFormat: "oklch", mapOutputsToSrgb: false },
  "p3-rgb": { authoringGamut: "display-p3", outputFormat: "rgb", mapOutputsToSrgb: false },
  "rec2020-oklch": { authoringGamut: "rec2020", outputFormat: "oklch", mapOutputsToSrgb: false },
};
const settingsBase = { side: "auto" as const, backgroundBlend: 0, colorSourceCurveOffset: -1, colorScaleType: "opaque" as const };

function scale(name: string, interpolation: "oklch" | "rgb"): ColorScale {
  return { id: name, name, interpolation, stops: SCALES[name].map(([lightness, hue, chroma], i) => ({ id: `${name}-${i}`, lightness, hue, chroma })) };
}

const out: Record<string, unknown> = {};
// Scale generation
const scales: unknown[] = [];
for (const outputId of Object.keys(OUTPUTS)) {
  const output = OUTPUTS[outputId];
  for (const interpolation of ["oklch", "rgb"] as const) {
    for (const name of Object.keys(SCALES)) {
      const s = scale(name, interpolation);
      const data = buildScaleData(s, output);
      for (const bgLightness of [1, 0.08, 0.5]) {
        const bg = resolveScaleColorAtLightness(scale("gray", interpolation), bgLightness, output);
        const steps = CONTRASTS.map((c) => {
          const g = generateColors(data, bg.linear, c, { ...settingsBase, colorOutput: output } as never);
          return { target: c, css: g.opaque.css, measured: g.opaque.measuredContrast };
        });
        scales.push({ output: outputId, interpolation, scale: name, backgroundLightness: bgLightness, background: bg.css, steps });
      }
    }
  }
}
out.scales = scales;

// Resolve at lightness
out.atLightness = Object.keys(SCALES).flatMap((name) =>
  [0, 0.08, 0.3, 0.5, 0.75, 0.97, 1].flatMap((l) =>
    (["oklch", "rgb"] as const).map((interpolation) => ({ scale: name, interpolation, lightness: l, css: resolveScaleColorAtLightness(scale(name, interpolation), l, OUTPUTS["rec2020-oklch"]).css })),
  ),
);

// Gamut clamp
out.gamutClamp = [[0.7, 0.35, 30], [0.9, 0.3, 120], [0.5, 0.2, 270], [0.3, 0.1, 150]].flatMap(([l, c, h]) =>
  (["srgb", "display-p3", "rec2020"] as const).map((gamut) => ({ input: [l, c, h], gamut, linear: gamutClamp(l, c, h, gamut) })),
);

// Polarity math
out.polarity = {
  compensated: [0, 0.1, 0.5, 1].flatMap((strength) => CONTRASTS.map((c) => ({ ratio: c, strength, light: compensatedContrast(c, strength, "light"), dark: compensatedContrast(c, strength, "dark") }))),
  weight: [0, 0.0005, 0.01, 0.05, 0.18, 0.5, 1].map((y) => ({ y, light: polarityWeight(y, "light"), dark: polarityWeight(y, "dark") })),
  effective: [0.25, 0.5, 0.9, 1].flatMap((weight) => [1.15, 3, 4.79, 12.3].map((value) => ({ weight, value, effective: effectiveContrast({ value }, { weight, strength: 0.1, reference: "light" }), withOpposite: effectiveContrast({ value, oppositeValue: value * 1.3 }, { weight, strength: 0.1, reference: "light" }) }))),
  multiply: [0, 0.5, 1, 1.5, 2, 3].flatMap((m) => CONTRASTS.map((c) => ({ ratio: c, multiplier: m, value: multiplyContrast(c, m) }))),
};

// Document-level: polarity + multiplier + surfaces
function doc(bgL: number, polarity: number, multiplier: number, output: ColorOutputSettings): ColorSystemDocument {
  return {
    backgroundScaleId: "gray", backgroundLightness: bgL,
    scales: [scale("gray", "oklch"), scale("blue", "oklch"), scale("red", "oklch")],
    contrasts: CONTRASTS.map((value, i) => ({ id: `c${i}`, value })),
    surfaces: [
      { id: "base", name: "base", base: true },
      { id: "raised", name: "raised", reference: "parent", contrast: 1.1, source: "base" },
      { id: "floating", name: "floating", reference: "base", contrast: 1.6, source: "base" },
      { id: "info", name: "info", reference: "parent", contrast: 1.15, sourceScaleId: "blue" },
    ],
    settings: { ...settingsBase, colorOutput: output, contrastReference: "light", polarityCompensation: polarity, contrastMultiplier: multiplier },
  };
}
const documents: unknown[] = [];
for (const [bgL, polarity, multiplier] of [[1, 0.1, 1], [0.08, 0.1, 1], [0.08, 0, 1], [0.08, 0.5, 2], [1, 0.1, 2], [0.15, 0.1, 0.7]] as const) {
  for (const outputId of ["srgb-rgb", "rec2020-oklch"]) {
    const output = OUTPUTS[outputId];
    const d = applyContrastMultiplier(applyPolarityCompensation(doc(bgL, polarity, multiplier, output)));
    const surfaces: Record<string, string> = {};
    let parent: readonly [number, number, number] | undefined;
    for (const s of d.surfaces) {
      const linear = surfaceLinear(s, d, parent);
      parent = linear;
      surfaces[s.id] = outputColorCss(linear, output);
    }
    documents.push({ backgroundLightness: bgL, polarity, multiplier, output: outputId, backgroundLuminance: backgroundLuminance(d), contrasts: d.contrasts.map((c) => c.value), surfaceContrasts: d.surfaces.map((s) => s.contrast ?? null), surfaces });
  }
}
out.documents = documents;
out.meta = { source: "Spectrum Studio color-system (spectrum-design-data docs/spectrum-studio)", colorjs: "0.5.2", recorded: new Date().toISOString().slice(0, 10) };
void linearToOklch; void luminance;
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log("scales", scales.length, "documents", documents.length);

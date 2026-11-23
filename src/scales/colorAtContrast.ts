// Copyright 2026 Adobe. All rights reserved.
import {
  clamp01,
  contrastRatio,
  deltaE,
  linearToHex,
  outputColorCss,
  linearToOklab,
  convertLinearGamut,
  luminance,
  mapLinearRgb,
  targetLuminance,
  type LinearRgb,
} from "../math/colorMath";
import { enforceOutputContrast, parsedOutputLinear } from "../math/outputContrast";
import { readAnchors, type ScaleData } from "./scaleData";

export interface GeneratedColor {
  linear: LinearRgb;
  hex: string;
  css: string;
  measuredContrast: number;
}

export interface GeneratedColors {
  targetContrast: number;
  targetLuminance: number;
  sourceLuminance: number;
  alpha: number;
  isDark: boolean;
  sourceLinear: LinearRgb;
  dynamic: GeneratedColor;
  opaque: GeneratedColor;
  chromaDeltaE: number;
}

// Keyed by the anchors, which stay the same object when buildScaleData reuses a cached scale.
const generationCache = new WeakMap<ScaleData["anchors"], Map<string, GeneratedColors>>();

function createGeneratedColor(
  linear: LinearRgb,
  backgroundLuminance: number,
  scaleData: ScaleData,
): GeneratedColor {
  return {
    linear,
    hex: linearToHex(linear, scaleData.gamut),
    css: outputColorCss(linear, scaleData.output, scaleData.gamut),
    measuredContrast: contrastRatio(
      luminance(linear, scaleData.gamut),
      backgroundLuminance,
    ),
  };
}

export function generateColors(
  scaleData: ScaleData,
  background: LinearRgb,
  targetContrast: number,
  sideOverride?: boolean,
): GeneratedColors {
  const cacheKey = JSON.stringify([background, targetContrast, sideOverride]);
  const cache =
    generationCache.get(scaleData.anchors) ?? new Map<string, GeneratedColors>();
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const backgroundCss = outputColorCss(
    background,
    scaleData.output,
    scaleData.gamut,
  );
  if (typeof scaleData.output === "object")
    background = parsedOutputLinear(backgroundCss, scaleData.gamut);
  const backgroundLuminance = luminance(background, scaleData.gamut);
  const isDark = sideOverride ?? backgroundLuminance > 0.1791;
  const desiredLuminance = targetLuminance(
    backgroundLuminance,
    targetContrast,
    isDark,
  );
  const extremity = scaleData.neutral
    ? 1
    : clamp01((1 - targetContrast) / 11);
  const endpoint = isDark ? 0 : 1;
  const sourceLuminance = clamp01(
    desiredLuminance + extremity * (endpoint - desiredLuminance),
  );
  const source = readAnchors(scaleData.anchors, sourceLuminance);
  const sourceDifference = isDark
    ? Math.min(
        luminance(source, scaleData.gamut) - backgroundLuminance,
        -0.0001,
      )
    : Math.max(
        luminance(source, scaleData.gamut) - backgroundLuminance,
        0.0001,
      );
  const alpha = clamp01(
    (desiredLuminance - backgroundLuminance) / sourceDifference,
  );
  const dynamicLinear = mapLinearRgb(
    source,
    (channel, index) => alpha * channel + (1 - alpha) * background[index],
  );
  const opaqueLinear = readAnchors(scaleData.anchors, desiredLuminance);
  const final = (linear: LinearRgb): GeneratedColor => {
    if (typeof scaleData.output !== "object")
      return createGeneratedColor(linear, backgroundLuminance, scaleData);
    const result = enforceOutputContrast(
      linear,
      backgroundCss,
      targetContrast,
      scaleData.output,
      isDark,
      scaleData.scale.name,
    );
    return { ...result, hex: linearToHex(result.linear, scaleData.gamut) };
  };
  let dynamic: GeneratedColor | undefined;
  let opaque: GeneratedColor | undefined;
  const resolveOpaque = () => (opaque ??= final(opaqueLinear));

  const result: GeneratedColors = {
    targetContrast,
    targetLuminance: desiredLuminance,
    sourceLuminance,
    alpha,
    isDark,
    sourceLinear: source,
    get dynamic() {
      return (dynamic ??= final(dynamicLinear));
    },
    get opaque() {
      return resolveOpaque();
    },
    get chromaDeltaE() {
      return deltaE(
        linearToOklab(
          convertLinearGamut(result.dynamic.linear, scaleData.gamut, "srgb"),
        ),
        linearToOklab(
          convertLinearGamut(resolveOpaque().linear, scaleData.gamut, "srgb"),
        ),
      );
    },
  };
  cache.set(cacheKey, result);
  if (cache.size > 128) cache.delete(cache.keys().next().value!);
  generationCache.set(scaleData.anchors, cache);
  return result;
}

// Copyright 2026 Adobe. All rights reserved.
import Color from "./color";
import {
  contrastRatio,
  luminance,
  mapLinearRgb,
  toGamma,
  toLinear,
  type LinearRgb,
  type RgbGamut,
} from "./colorMath";
import {
  colorJsSpace,
  outputGamut,
  type ColorOutputSettings,
} from "./outputSettings";
import { serializeLinearOutputColor } from "./outputSerialization";

interface ParsedOutput {
  color: Color;
  linear?: LinearRgb;
  encoded?: number[];
}
const parsedOutputs = new Map<string, ParsedOutput>();
let parsedCharacters = 0;
function parsedOutput(css: string, gamut: RgbGamut): ParsedOutput {
  const key = `${gamut}\0${css}`;
  const cached = parsedOutputs.get(key);
  if (cached) return cached;
  const entry = { color: new Color(css) };
  if (key.length > 512) return entry;
  while (
    parsedOutputs.size >= 4096 ||
    parsedCharacters + key.length > 262_144
  ) {
    const oldest = parsedOutputs.keys().next().value;
    if (oldest === undefined) break;
    parsedOutputs.delete(oldest);
    parsedCharacters -= oldest.length;
  }
  parsedOutputs.set(key, entry);
  parsedCharacters += key.length;
  return entry;
}

export function parsedOutputLinear(css: string, gamut: RgbGamut): LinearRgb {
  const entry = parsedOutput(css, gamut);
  if (entry.linear) return [...entry.linear];
  const parsed = entry.color;
  if (parsed.space.id === "oklch" && Number(parsed.coords[1]) === 0) {
    const neutral = Number(parsed.coords[0]) ** 3;
    entry.linear = [neutral, neutral, neutral];
    return [neutral, neutral, neutral];
  }
  const color = parsed.to(`${colorJsSpace(gamut)}-linear`);
  const values = color.coords.map(Number);
  if (values.length !== 3 || !values.every(Number.isFinite))
    throw new Error(`Cannot measure output color ${css}.`);
  entry.linear = [values[0], values[1], values[2]];
  return [...entry.linear];
}

function renderedOutputLinear(
  css: string,
  backgroundCss: string,
  gamut: RgbGamut,
): LinearRgb {
  const foregroundEntry = parsedOutput(css, gamut),
    backgroundEntry = parsedOutput(backgroundCss, gamut);
  const foreground = foregroundEntry.color,
    background = backgroundEntry.color;
  if (Number(background.alpha) !== 1)
    throw new Error("A contrast background must be opaque.");
  const alpha = Number(foreground.alpha);
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)
    throw new Error("A contrast foreground has invalid opacity.");
  const encodedChannels = (entry: ParsedOutput) => {
    if (entry.encoded) return entry.encoded;
    const color = entry.color;
    if (color.space.id === "oklch" && Number(color.coords[1]) === 0) {
      const neutral = toGamma(Number(color.coords[0]) ** 3, gamut);
      entry.encoded = [neutral, neutral, neutral];
    } else {
      entry.encoded = color.to(colorJsSpace(gamut)).coords.map(Number);
    }
    return entry.encoded;
  };
  const fg = encodedChannels(foregroundEntry),
    bg = encodedChannels(backgroundEntry);
  const encoded = fg.map(
    (channel, index) => channel * alpha + bg[index] * (1 - alpha),
  );
  if (!encoded.every(Number.isFinite))
    throw new Error("Cannot measure the composited output color.");
  return [
    toLinear(encoded[0], gamut),
    toLinear(encoded[1], gamut),
    toLinear(encoded[2], gamut),
  ];
}

export function measureOutputContrast(
  css: string,
  backgroundCss: string,
  gamut: RgbGamut,
): number {
  return contrastRatio(
    luminance(renderedOutputLinear(css, backgroundCss, gamut), gamut),
    luminance(parsedOutputLinear(backgroundCss, gamut), gamut),
  );
}

function validateTarget(target: number) {
  if (!Number.isFinite(target) || target < 1 || target > 21)
    throw new Error("Choose a finite contrast target from 1:1 to 21:1.");
}

export function enforceOutputContrast(
  candidate: LinearRgb,
  backgroundCss: string,
  target: number,
  settings: ColorOutputSettings,
  isDark: boolean,
  _source?: string,
) {
  void _source;
  validateTarget(target);
  const gamut = outputGamut(settings);
  const evaluations = new Map<
    string,
    { css: string; linear: LinearRgb; measuredContrast: number }
  >();
  const evaluate = (linear: LinearRgb) => {
    const css = serializeLinearOutputColor(linear, settings);
    const previous = evaluations.get(css);
    if (previous) return previous;
    const result = {
      css,
      linear: parsedOutputLinear(css, gamut),
      measuredContrast: measureOutputContrast(css, backgroundCss, gamut),
    };
    evaluations.set(css, result);
    return result;
  };
  const initial = evaluate(candidate);
  if (initial.measuredContrast >= target) return initial;
  const endpoint: LinearRgb = isDark ? [0, 0, 0] : [1, 1, 1];
  let best = evaluate(endpoint);
  if (best.measuredContrast < target) return best;
  let low = 0,
    high = 1;
  for (let iteration = 0; iteration < 46; iteration += 1) {
    const fraction = (low + high) / 2;
    const result = evaluate(
      mapLinearRgb(
        candidate,
        (channel, index) => channel + fraction * (endpoint[index] - channel),
      ),
    );
    if (result.measuredContrast >= target) {
      high = fraction;
      best = result;
    } else low = fraction;
  }
  return best;
}

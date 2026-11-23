import { convertLinearGamut, mapLinearRgb, RGB_TRANSFER, type LinearRgb, type RgbGamut } from "../math/colorMath";
import { apcaContrast, apcaFromLuminance, apcaLuminance } from "../math/apca";
import type { ColorOutputSettings } from "../math/outputSettings";
import { outputGamut } from "../math/outputSettings";
import { serializeLinearOutputColor } from "../math/outputSerialization";
import { parsedOutputLinear } from "../math/outputContrast";
import { readAnchors, type ScaleData } from "./scaleData";
import { luminance } from "../math/colorMath";

function encodeSrgb(channel: number) {
  const t = RGB_TRANSFER.srgb;
  const magnitude = Math.abs(channel);
  const encoded = magnitude <= t.linearThreshold ? magnitude * t.slope : t.factor * magnitude ** t.exponent - t.offset;
  return Math.sign(channel) * encoded;
}

/** APCA screen luminance of a linear color in the given gamut. */
export function apcaLuminanceOfLinear(linear: LinearRgb, gamut: RgbGamut) {
  return apcaLuminance(convertLinearGamut(linear, gamut, "srgb").map(encodeSrgb));
}

export interface ApcaGenerated {
  css: string;
  linear: LinearRgb;
  measuredContrast: number;
  isDark: boolean;
}

/** Picks the text side (dark or light) that can reach more APCA contrast on this background. */
export function apcaPrefersDark(background: LinearRgb, gamut: RgbGamut) {
  const bgY = apcaLuminanceOfLinear(background, gamut);
  return Math.abs(apcaFromLuminance(0, bgY)) >= Math.abs(apcaFromLuminance(1, bgY));
}

/**
 * Finds the scale color that reaches an APCA Lc target against the background,
 * staying as close to the background as possible. If the target cannot be
 * reached, returns black or white (whichever side was chosen).
 */
export function generateApcaColor(
  scaleData: ScaleData,
  background: LinearRgb,
  backgroundCss: string,
  target: number,
  settings: ColorOutputSettings,
  isDark: boolean,
): ApcaGenerated {
  const gamut = outputGamut(settings);
  const bgY = apcaLuminanceOfLinear(background, gamut);
  const bgLum = luminance(background, gamut);
  const at = (fraction: number) => {
    const lum = bgLum + fraction * ((isDark ? 0 : 1) - bgLum);
    return readAnchors(scaleData.anchors, lum);
  };
  const fast = (linear: LinearRgb) => Math.abs(apcaFromLuminance(apcaLuminanceOfLinear(linear, gamut), bgY));
  const measure = (linear: LinearRgb) => {
    const css = serializeLinearOutputColor(linear, settings);
    return { css, linear: parsedOutputLinear(css, gamut), measuredContrast: Math.abs(apcaContrast(css, backgroundCss)) };
  };
  let low = 0;
  let high = 1;
  if (fast(at(1)) < target) {
    const endpoint: LinearRgb = isDark ? [0, 0, 0] : [1, 1, 1];
    return { ...measure(endpoint), isDark };
  }
  for (let i = 0; i < 40; i += 1) {
    const middle = (low + high) / 2;
    if (fast(at(middle)) >= target) high = middle;
    else low = middle;
  }
  // Rounding in the output format can lose a little contrast; step outward until it passes.
  let fraction = high;
  let result = measure(at(fraction));
  for (let i = 0; i < 60 && result.measuredContrast < target && fraction < 1; i += 1) {
    fraction = Math.min(1, fraction + 0.002);
    result = measure(at(fraction));
  }
  if (result.measuredContrast < target) {
    const endpoint: LinearRgb = isDark ? [0, 0, 0] : [1, 1, 1];
    const towardEnd = mapLinearRgb(result.linear, (c, i) => c + 0.5 * (endpoint[i] - c));
    const fallback = measure(towardEnd);
    if (fallback.measuredContrast >= target) result = fallback;
  }
  return { ...result, isDark };
}

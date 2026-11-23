import Color from "./color";

// APCA 0.0.98G constants (https://github.com/Myndex/apca-w3).
const NORM_BG = 0.56;
const NORM_TXT = 0.57;
const REV_TXT = 0.62;
const REV_BG = 0.65;
const BLK_THRS = 0.022;
const BLK_CLMP = 1.414;
const SCALE = 1.14;
const OFFSET = 0.027;
const LO_CLIP = 0.1;
const DELTA_Y_MIN = 0.0005;

/** Highest Lc APCA can report (white text on black). */
export const MAX_APCA = 108;

/** APCA "screen luminance" from gamma-encoded sRGB channels (may be outside 0–1 for wide-gamut colors). */
export function apcaLuminance(encoded: readonly number[]) {
  const lin = (value: number) => Math.sign(value) * Math.abs(value) ** 2.4;
  return (
    lin(encoded[0]) * 0.2126729 +
    lin(encoded[1]) * 0.7151522 +
    lin(encoded[2]) * 0.072175
  );
}

function softClamp(y: number) {
  return y >= BLK_THRS ? y : y + (BLK_THRS - y) ** BLK_CLMP;
}

/**
 * Signed APCA lightness contrast (Lc) from screen luminances.
 * Positive is dark text on a light background; negative is light text on dark.
 *
 * Official APCA reports 0 below Lc 7.3. Set `smooth` to keep a linear
 * extension down to 0 instead, so very subtle steps (borders, surfaces)
 * stay distinct. Values at or above 7.3 are identical to official APCA.
 */
export function apcaFromLuminance(textY: number, backgroundY: number, smooth = true) {
  const txt = softClamp(textY);
  const bg = softClamp(backgroundY);
  if (Math.abs(bg - txt) < DELTA_Y_MIN) return 0;
  const raw =
    bg > txt
      ? (bg ** NORM_BG - txt ** NORM_TXT) * SCALE
      : (bg ** REV_BG - txt ** REV_TXT) * SCALE;
  const magnitude = Math.abs(raw);
  const sign = Math.sign(raw);
  if (magnitude < LO_CLIP) {
    return smooth ? sign * magnitude * ((LO_CLIP - OFFSET) / LO_CLIP) * 100 : 0;
  }
  return sign * (magnitude - OFFSET) * 100;
}

function srgbCoords(color: string | Color) {
  const parsed = typeof color === "string" ? new Color(color) : color;
  return parsed.to("srgb").coords.map((value) => Number(value) || 0);
}

/** Signed APCA Lc for a text color on a background color (any CSS color strings). */
export function apcaContrast(text: string | Color, background: string | Color, smooth = true) {
  return apcaFromLuminance(
    apcaLuminance(srgbCoords(text)),
    apcaLuminance(srgbCoords(background)),
    smooth,
  );
}

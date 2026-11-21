import type { ColorFormat, ColorGamut } from "../math/outputSettings";

export type Platform =
  | "web"
  | "css"
  | "tailwind"
  | "dtcg"
  | "ios"
  | "swiftui"
  | "uikit"
  | "macos"
  | "visionos"
  | "android"
  | "compose"
  | "flutter"
  | "react-native"
  | "email"
  | "legacy";

export interface PlatformOutput {
  gamut: ColorGamut;
  format: ColorFormat;
  /** Why this gamut was chosen, in plain words. */
  reason: string;
}

const WIDE = "Modern browsers and design tokens support wide-gamut OKLCH, so colors keep their full range and older screens map them down automatically.";
const P3 = "This platform is built around Display P3, so colors are limited to P3 and written as P3 red, green, and blue values.";
const SRGB = "This technology only reliably supports sRGB, so colors are mapped into sRGB and written as hex.";

const TABLE: Record<Platform, Omit<PlatformOutput, "reason"> & { reason: string }> = {
  web: { gamut: "rec2020", format: "oklch", reason: WIDE },
  css: { gamut: "rec2020", format: "oklch", reason: WIDE },
  tailwind: { gamut: "rec2020", format: "oklch", reason: WIDE },
  dtcg: { gamut: "rec2020", format: "oklch", reason: WIDE },
  ios: { gamut: "display-p3", format: "rgb", reason: P3 },
  swiftui: { gamut: "display-p3", format: "rgb", reason: P3 },
  uikit: { gamut: "display-p3", format: "rgb", reason: P3 },
  macos: { gamut: "display-p3", format: "rgb", reason: P3 },
  visionos: { gamut: "display-p3", format: "rgb", reason: P3 },
  android: { gamut: "display-p3", format: "rgb", reason: P3 },
  compose: { gamut: "display-p3", format: "rgb", reason: P3 },
  flutter: { gamut: "srgb", format: "hex", reason: SRGB },
  "react-native": { gamut: "srgb", format: "hex", reason: SRGB },
  email: { gamut: "srgb", format: "hex", reason: SRGB },
  legacy: { gamut: "srgb", format: "hex", reason: SRGB },
};

export const PLATFORMS = Object.keys(TABLE) as Platform[];

/** The output gamut and format that fit a platform. Pass the result to `generateTheme({ output })`. */
export function platformOutput(platform: Platform): PlatformOutput {
  const entry = TABLE[platform];
  if (!entry) throw new Error(`Unknown platform "${platform}". Choose one of: ${PLATFORMS.join(", ")}.`);
  return { ...entry };
}

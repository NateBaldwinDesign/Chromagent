// Copyright 2026 Adobe. All rights reserved.
export const COLOR_GAMUTS = ["srgb", "display-p3", "rec2020"] as const;
export const COLOR_FORMATS = ["rgb", "oklch", "hex", "hsl"] as const;
export type ColorGamut = (typeof COLOR_GAMUTS)[number];
export type ColorFormat = (typeof COLOR_FORMATS)[number];

export interface ColorOutputSettings {
  authoringGamut: ColorGamut;
  outputFormat: ColorFormat;
  mapOutputsToSrgb: boolean;
}

export function outputGamut(settings: ColorOutputSettings): ColorGamut {
  return settings.mapOutputsToSrgb ? "srgb" : settings.authoringGamut;
}

export function isColorOutputSettings(
  value: unknown,
): value is ColorOutputSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 3 &&
    COLOR_GAMUTS.some((gamut) => gamut === record.authoringGamut) &&
    COLOR_FORMATS.some((format) => format === record.outputFormat) &&
    typeof record.mapOutputsToSrgb === "boolean" &&
    (record.mapOutputsToSrgb ||
      record.authoringGamut === "srgb" ||
      record.outputFormat === "rgb" ||
      record.outputFormat === "oklch")
  );
}

export function colorJsSpace(gamut: ColorGamut) {
  return gamut === "display-p3" ? "p3" : gamut;
}

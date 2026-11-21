// Copyright 2026 Adobe. All rights reserved.
// Internal engine types, adapted from the Spectrum Studio color-system model.
import type { ColorOutputSettings } from "./math/outputSettings";
import type { ColorScaleInterpolation } from "./scales/scaleInterpolation";

export type ContrastSide = "auto" | "light" | "dark";
export type ContrastReference = "light" | "dark";

/** A key color. Chroma is a percent where 100 = OKLCH chroma 0.4. */
export interface ColorStop {
  id: string;
  lightness: number;
  hue: number;
  chroma: number;
}

export interface ContrastToken {
  id: string;
  value: number;
  oppositeValue?: number;
}

export interface ColorScale {
  id: string;
  name: string;
  stops: ColorStop[];
  interpolation?: ColorScaleInterpolation;
}

export interface Surface {
  id: string;
  name: string;
  base?: boolean;
  source?: string;
  sourceScaleId?: string;
  reference?: "base" | "parent";
  contrast?: number;
  forceDark?: boolean;
}

export interface EngineSettings {
  side: ContrastSide;
  backgroundBlend: number;
  colorSourceCurveOffset: number;
  colorOutput: ColorOutputSettings;
  contrastReference?: ContrastReference;
  polarityCompensation?: number;
  contrastMultiplier?: number;
}

export interface ColorSystemDocument {
  backgroundScaleId: string;
  backgroundLightness: number;
  scales: ColorScale[];
  contrasts: ContrastToken[];
  surfaces: Surface[];
  settings: EngineSettings;
}

// Type-only stub for recording reference values.
import type { OutputColorSpace } from "./colorMath";
import type { ColorOutputSettings } from "./outputSettings";
export type ContrastSide = "auto" | "light" | "dark";
export type ContrastReference = "light" | "dark";
export type ColorScaleType = "dynamic-blend" | "opaque" | "transparent";
export type OutputGamut = OutputColorSpace;
export interface ColorStopInput { lightness: number; hue: number; chroma: number }
export interface ColorStop extends ColorStopInput { id: string }
export interface ContrastToken { id: string; value: number; oppositeValue?: number }
export interface ColorScale { id: string; name: string; stops: ColorStop[]; interpolation?: "oklch" | "rgb"; customContrasts?: { steps: ContrastToken[]; baseContrastId: string; namingRuleId: string } }
export interface Surface { id: string; name: string; base?: boolean; source?: string; sourceScaleId?: string; reference?: "base" | "parent"; contrast?: number; forceDark?: boolean }
export interface ColorSystemDocument {
  backgroundScaleId: string; backgroundLightness: number; scales: ColorScale[]; contrasts: ContrastToken[]; surfaces: Surface[];
  settings: { side: ContrastSide; backgroundBlend: number; colorSourceCurveOffset: number; colorOutput: ColorOutputSettings; contrastReference?: ContrastReference; polarityCompensation?: number; contrastMultiplier?: number; colorScaleType?: ColorScaleType };
}

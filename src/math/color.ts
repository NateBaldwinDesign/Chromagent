import {
  A98RGB,
  A98RGB_Linear,
  ColorSpace,
  HSL,
  HWB,
  Lab,
  LCH,
  OKLab,
  OKLCH,
  P3,
  P3_Linear,
  ProPhoto,
  ProPhoto_Linear,
  REC_2020,
  REC_2020_Linear,
  sRGB,
  sRGB_Linear,
  XYZ_D50,
  XYZ_D65,
  clone,
  getColor,
  inGamut,
  serialize,
  to,
  toGamut,
  type PlainColorObject,
} from "colorjs.io/fn";

// Only the color spaces CSS can name. Loading these instead of the whole library keeps the bundles small.
for (const space of [sRGB, sRGB_Linear, HSL, HWB, Lab, LCH, OKLab, OKLCH, P3, P3_Linear, REC_2020, REC_2020_Linear, A98RGB, A98RGB_Linear, ProPhoto, ProPhoto_Linear, XYZ_D65, XYZ_D50])
  ColorSpace.register(space);

type Coords = [number, number, number];

/** The parts of colorjs.io's Color class the engine uses, built on its tree-shakable functions. */
export default class Color implements PlainColorObject {
  static Space = ColorSpace;
  space: ColorSpace;
  coords: Coords;
  alpha: number;

  constructor(color: string | PlainColorObject);
  constructor(space: string, coords: readonly number[], alpha?: number);
  constructor(color: string | PlainColorObject, coords?: readonly number[], alpha = 1) {
    const plain = coords ? { space: ColorSpace.get(color as string), coords: [...coords] as Coords, alpha } : getColor(color);
    this.space = plain.space;
    this.coords = plain.coords;
    this.alpha = plain.alpha;
  }

  to(space: string) {
    return new Color(to(this, space));
  }

  toGamut(options: { space: string; method?: string }) {
    return new Color(toGamut(this, options));
  }

  inGamut(space: string, options?: { epsilon?: number }) {
    return inGamut(this, space, options);
  }

  clone() {
    return new Color(clone(this));
  }

  toString(options?: Parameters<typeof serialize>[1]) {
    return serialize(this, options);
  }
}

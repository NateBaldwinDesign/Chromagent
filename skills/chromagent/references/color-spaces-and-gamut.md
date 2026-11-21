# Color spaces and gamut

How color models, color spaces, and gamut work, and which space to use for each UI color task.

- Color models and color spaces
- RGB spaces: sRGB, Display P3, and Rec. 2020
- Reference spaces: XYZ and LMS
- Uniform spaces: CIELAB, CIELUV, OKLab, and OKLCH
- Color appearance models: CAM02 and CAM16
- Gamut, clamping, and gamut mapping
- Color profiles
- Color interpolation
- When to use which space

## Color models and color spaces

A color model is a way to describe color, such as RGB (red, green, blue) or CMYK (cyan, magenta, yellow, black). A color space is a model made exact with math and a fixed set of primaries. sRGB is a color space. RGB is a model.

Screens mix light, which is additive. Paint and print mix pigment, which is subtractive. Screens never use CMYK or RYB (red, yellow, blue), but many people think in paint-mixing terms.

Some spaces have a cylindrical form (lightness, chroma or saturation, and hue). These forms are easier to reason about. HSL, HSV, and HWB are cylindrical forms of sRGB. LCH is the cylindrical form of CIELAB. OKLCH is the cylindrical form of OKLab.

Source: colorandcontrast.com/color-model/, colorandcontrast.com/color-space/

## RGB spaces

### sRGB

The default color space of the web and most displays. Hex, `rgb()`, `hsl()`, and `hwb()` in CSS are all sRGB.

- Widely supported and safe for defining final UI colors.
- Not perceptually uniform. Mixing tints, shades, or tones in sRGB or HSL gives uneven results. HSL "lightness" does not match perceived lightness.

Source: colorandcontrast.com/srgb/

### Display P3

A wide-gamut RGB space used by most modern phones, tablets, and laptop displays. It holds more vivid colors than sRGB. In CSS, use `color(display-p3 r g b)`.

- Browsers that support `color()` and `oklch()` map colors to the screen automatically. Add an sRGB hex fallback only when older browsers must be supported.
- Do not convert P3 channel values to sRGB one-to-one. The result will look much less colorful than intended.

Source: colorandcontrast.com/display-p3/

### Rec. 2020

A very wide-gamut RGB space made for ultra-high-definition and HDR video. Few displays can show its full range. In CSS, use `color(rec2020 r g b)`. It is rarely needed for UI colors.

## Reference spaces

### XYZ

A space created by the International Commission on Illumination (CIE) to match all visible colors. Its Y value is relative luminance, which WCAG 2 uses for contrast. Other spaces convert through XYZ. It is not used to pick UI colors.

Source: colorandcontrast.com/xyz/

### LMS

A space that models the three cone responses of the eye. It is used to simulate color vision deficiency, not to pick UI colors.

Source: colorandcontrast.com/lms/

## Uniform spaces

A uniform color space (perceptually uniform space) aims to make equal number changes look like equal visual changes. These spaces are models, and perception is more complex. Use them as a strong starting point, then check by eye.

### CIELAB and CIELUV

Uniform spaces created in 1976 by the CIE. Both are opponent spaces (built on red–green and blue–yellow channels). CIELAB is in CSS as `lab()` and `lch()`. CIELUV is not in CSS. HSLuv is a cylindrical form of CIELUV. CIELAB blues can drift toward purple when lightened.

Source: colorandcontrast.com/cielab/, colorandcontrast.com/cieluv/

### OKLab and OKLCH

A uniform space created in 2020 by Björn Ottosson. It is based on CAM16 and IPT, and it aims to blend well and behave well with math. OKLCH is its cylindrical form, with lightness (L), chroma (C), and hue (H).

- CSS: `oklch(62% 0.19 255)` or `oklch(0.62 0.19 255)`.
- L runs from 0 (black) to 1 (white). Chroma starts at 0 (gray). Its highest possible value depends on the hue and the gamut.
- Hue stays steadier than in LCH or HSL as lightness changes.

Chromagent reports colors as OKLCH `[l, c, h]`. This is the recommended space for picking and adjusting UI colors.

Source: colorandcontrast.com/oklab/

## Color appearance models

A color appearance model accounts for viewing conditions (such as surround and adapting light) and perceptual effects. Under fixed viewing conditions, it acts as a uniform color space. CIELAB, CIELUV, CAM02, CAM16, and OKLab are often grouped together here.

### CAM02 and CAM16

Color appearance models created by the CIE in 2002 (CAM02, also called CIECAM02) and 2016 (CAM16). CAM16 improves on CAM02. Neither is in CSS, but color libraries support them.

In UI: Most UI color work does not need a full appearance model. Use one when an exact perceptual match matters, such as for data visualization.

Source: colorandcontrast.com/color-appearance-model/, colorandcontrast.com/cam16/

## Gamut, clamping, and gamut mapping

A gamut is the full set of colors a space can hold. Spaces with large gamuts are "wide-gamut." Chromaticity (hue and colorfulness without lightness) diagrams are often used to compare gamuts.

A color from OKLCH or P3 can fall outside sRGB. There are two main ways to fix this:

- **Clamping** cuts each channel to its allowed range and rounds values. It is fast, but it can shift hue and lightness.
- **Gamut mapping** finds the closest in-gamut color, usually by lowering chroma while keeping lightness and hue. It looks more faithful. CSS Color 4 uses this approach in OKLCH.

In UI: Modern web CSS can keep wide-gamut OKLCH colors, and the browser maps them to each screen. Map to Display P3 only for platforms bound to it (such as iOS), and to sRGB only for older tech. Lightness can shift slightly after mapping, so contrast must be measured on the mapped color (Chromagent does this).

Source: colorandcontrast.com/gamut/, colorandcontrast.com/clamping/

## Color profiles

A color profile describes the color space of a device or file. International Color Consortium (ICC) profiles are the standard. Color management converts colors between profiles.

In UI: A web page in sRGB can still show images in other profiles correctly. Export image assets with the right profile. A CMYK image shown on screen can look muddy.

Source: colorandcontrast.com/color-profile/

## Color interpolation

Calculating colors between two known colors. It powers gradients, `color-mix()`, and generated scales. Interpolation is linear by default in most libraries.

- The space changes the result. sRGB blends can have dull, dark midpoints. OKLab gives more even midpoints.
- Cartesian blends of distant hues pass near gray. Cylindrical blends keep chroma but pass through other hues.
- Use a Cartesian space (such as OKLab) for one-hue scales.
- Use a cylindrical space (such as OKLCH) for multi-hue or analogous scales. Hue can travel the shorter or longer way around the wheel.
- CSS supports `linear-gradient(in oklch, ...)` and `color-mix(in oklab, ...)`.
- No single space is best. Curves or smoothing can improve a straight path.

Source: colorandcontrast.com/color-interpolation/

## When to use which space

| Task | Recommended space | Why |
|---|---|---|
| Define final web CSS colors | OKLCH (wide gamut) | Supported by modern browsers, which map to each screen |
| Colors for iOS, macOS, or Android | Display P3 | The platform's color space |
| Colors for email or older tech | sRGB (hex) | Widest support |
| Pick or adjust a color by lightness, chroma, hue | OKLCH | Steady hue, perceptual lightness |
| One-hue scale (tints and shades) | OKLab or OKLCH | Even steps, steady hue |
| Multi-hue scale or gradient | OKLCH | Keeps chroma steady as hue changes |
| Mix or blend two colors | OKLab | Even, natural-looking midpoints |
| Vivid colors on modern screens | OKLCH or Display P3 | Larger gamut |
| WCAG 2 contrast | sRGB to relative luminance (XYZ Y) | Required by the standard |
| Simulate color vision deficiency | LMS | Models cone responses |
| Precise perceptual matching | CAM16 | Accounts for viewing conditions |
| Avoid for scales and mixing | HSL, HSV, plain RGB | Not perceptually uniform |

Source: colorandcontrast.com/choosing-a-color-space/

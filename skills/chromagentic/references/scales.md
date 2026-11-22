# Color scales

How UI color scales are built, and how contrast-based scales keep each step's purpose the same in every mode.

Most apps don't need a full scale. Start from semantic roles (`references/semantic-roles.md`) and add steps only when the project needs them: a design system shared across many products, many tinted surfaces or tags, charts, or a team that already works with numbered steps. Turn full scales on with `"steps": true` or your own list of contrasts.

- Tints, shades, tones, and monochromatic colors
- UI color scales
- Creating color scales
- Contrast-based scales
- Typical step uses
- Color interpolation for scales
- Translucent colors
- Data visualization scales

## Tints, shades, tones, and monochromatic colors

- **Tint**: a lighter version of a color, generally equal to "adding white."
- **Shade**: a darker version of a color, generally equal to "adding black."
- **Tone**: a less colorful version of a color, generally equal to "adding gray" or adding the color's complement.
- **Monochromatic colors**: tints and shades of the same hue.

Tints and shades give the higher and lower contrast options a scale needs for text, borders, and backgrounds. Tones can suit dark mode, where less saturated colors may look more natural and cause less eye strain.

Source: colorandcontrast.com/tint/, colorandcontrast.com/shade/, colorandcontrast.com/tone/, colorandcontrast.com/monochromatic-colors/

## UI color scales

A UI color scale is a sequence of related colors used for text, icons, interactive elements, states, and decoration. A color theme usually has several scales, such as a neutral (gray) scale, an accent scale, and status scales (red, green, orange, and blue).

Every UI scale needs steps that meet or exceed WCAG 1.4.3 (contrast minimum).

Source: colorandcontrast.com/ui-color-scale/

## Creating color scales

Start with the compliance target:

- For WCAG AA, each scale needs steps that meet 3:1 and 4.5:1.
- For WCAG AAA, each scale needs steps that meet 4.5:1 and 7:1.

A simple palette may only need those steps. Most design systems need more options, such as subtle backgrounds, hover states, and borders.

Good scales look evenly spaced. This is harder than it seems:

- **Lightness is not linear in perception.** Stevens' power law means equal number steps do not look equal. Uniform color spaces alone do not fix this.
- **Neighbors distort each step.** Lateral inhibition makes adjacent steps look more different than they are. Judge steps side by side, alone, and in a real layout.
- **Hue drifts as lightness changes.** The Abney effect can make light tints look like a different hue. A small hue shift can keep the scale looking like one color. Cool colors can shift slightly warmer as they get lighter (Bezold–Brücke shift). Warm colors can shift slightly cooler as they get darker (Purkinje shift).
- **Chroma usually peaks near the middle.** Very light and very dark steps cannot hold much chroma, especially in sRGB.

Generated scales are easier to maintain than hand-picked ones. They can be rebuilt when a key color or target changes.

Source: colorandcontrast.com/creating-color-scales/

## Contrast-based scales

Chromagentic builds contrast-based scales. Each step is defined by a contrast ratio against the background, not by a fixed lightness value.

How it works:

1. Choose a key color (the hue and chroma for the scale).
2. Choose a background color.
3. List target ratios for each step, such as 1.1, 1.5, 3, 4.5, and 7.
4. The engine finds the lightness on the key color's path that meets each ratio.

The benefits:

- Each step has a fixed job. Step "4.5:1" is always safe for normal text.
- The same step meets the same contrast in every mode. When the background changes from white to near-black, every step is recalculated against it.
- Light mode, dark mode, and contrast modes come from the same scale definition.
- Tokens keep their meaning. A token like "text-secondary" stays valid in every theme.

On a dark background, steps with higher ratios are lighter. On a light background, they are darker. Step names describe contrast, not lightness.

Evenly spaced APCA Lc values also tend to look evenly spaced, because APCA accounts for Stevens' power law.

## Typical step uses

| Contrast against background | Typical use |
|---|---|
| 1.05–1.3 : 1 | Subtle backgrounds, hover fills, cards, and zebra rows |
| 1.3–2 : 1 | Decorative borders, dividers, and separators |
| 3 : 1 or more | Non-text UI: input borders, focus rings, icons, and large text (WCAG 1.4.11) |
| 4.5 : 1 or more | Normal text and links (WCAG 1.4.3 AA) |
| 7 : 1 or more | High-emphasis text and AAA text (WCAG 1.4.6) |

- Steps below 3:1 must not be the only way to show a component's boundary or state.
- Use a high-contrast step for content, not decoration. Too much strong contrast weakens hierarchy.
- Solid accent buttons often use a 3:1 or 4.5:1 fill, with text that meets 4.5:1 against the fill.

## Color interpolation for scales

Interpolation calculates the colors between two known colors. The color space changes the result.

- One-hue scales: interpolate in OKLab or OKLCH.
- Multi-hue scales (such as yellow to orange): interpolate in OKLCH.
- Avoid HSL and plain RGB. They give uneven lightness steps.
- Straight-line paths are not always best. Curves or smoothing can improve them.

See color-spaces-and-gamut.md for more detail.

Source: colorandcontrast.com/color-interpolation/

## Translucent colors

Opacity (alpha) can make subtle colors that adapt to any surface below them. A translucent color can keep a similar WCAG contrast on different surfaces.

Opacity does not look the same on light and dark backgrounds. Dark mode usually needs a higher opacity for the same visual weight. Check text contrast against the final blended color, not the translucent value.

Source: colorandcontrast.com/opacity/

## Data visualization scales

Data visualization uses three other kinds of scales:

- **Categorical**: different colors for unordered groups.
- **Sequential**: colors from low to high for numeric data.
- **Diverging**: two sequential scales with a neutral midpoint.

These are out of scope for this version of Chromagentic. If asked, explain the type and note that the engine does not generate them yet. Data visualizations also need more than color to be accessible.

Source: colorandcontrast.com/color-scale/

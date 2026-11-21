# Contrast

How contrast is measured with WCAG 2 and APCA, and how polarity, adaptation, and glare change what people see.

- Luminance and relative luminance
- WCAG 2 contrast ratio
- APCA
- Contrast polarity
- Why dark mode needs extra contrast with WCAG 2
- Contrast sensitivity
- Contrast adaptation and discrimination
- Optical glare
- Practical rules

## Luminance and relative luminance

Luminance is a measure of the light emitted from or reflected off a surface. It is a physical measurement, not a perceptual one. It differs from lightness, which describes how light a color looks.

Relative luminance is luminance on a scale from 0 (black) to 1 (white). It is the Y value in XYZ color space. WCAG 2 uses it to calculate contrast.

To get relative luminance from an sRGB color:

1. Divide each channel (R, G, B) by 255.
2. Linearize each channel: if the value is 0.04045 or less, divide by 12.92. Otherwise, use ((value + 0.055) / 1.055) ^ 2.4.
3. Combine: L = 0.2126 × R + 0.7152 × G + 0.0722 × B.

Green adds the most luminance and blue the least. This is why yellow looks light and blue looks dark at full strength.

Source: colorandcontrast.com/luminance/, colorandcontrast.com/relative-luminance/

## WCAG 2 contrast ratio

The Web Content Accessibility Guidelines (WCAG) 2 compare the relative luminance of two colors:

Contrast ratio = (L1 + 0.05) / (L2 + 0.05), where L1 is the lighter color.

The result runs from 1:1 (no contrast) to 21:1 (black on white). Do not round up. A ratio of 4.49:1 fails a 4.5:1 target.

| Criterion | Level | Content | Minimum ratio |
|---|---|---|---|
| 1.4.3 Contrast (minimum) | AA | Normal text | 4.5:1 |
| 1.4.3 Contrast (minimum) | AA | Large text | 3:1 |
| 1.4.6 Contrast (enhanced) | AAA | Normal text | 7:1 |
| 1.4.6 Contrast (enhanced) | AAA | Large text | 4.5:1 |
| 1.4.11 Non-text contrast | AA | UI components and meaningful graphics | 3:1 |

- Large text is at least 18 point (24 CSS pixels), or 14 point (about 18.66 CSS pixels) bold.
- Non-text contrast covers component boundaries, focus indicators, state indicators, icons, and chart parts needed to understand content.
- Disabled components, pure decoration, and logos are exempt.
- 1.4.1 (use of color) is related. Color must not be the only way to show meaning.

WCAG 2 is the current legal and procurement standard in many places. It works well for dark text on light backgrounds. It is less accurate for light text on dark backgrounds.

Source: colorandcontrast.com/relative-luminance/

## APCA

The Accessible Perceptual Contrast Algorithm (APCA) is a newer contrast method in development for WCAG 3. It models perception more closely than WCAG 2. It accounts for spatial frequency (text size and stroke width), surrounding contrast, and light and dark adaptation.

APCA reports a lightness contrast value (Lc). Values run from 0 to about 106 for dark text on light backgrounds. Light text on dark backgrounds gives negative values down to about −108. Compare the absolute value against targets.

| Lc (absolute) | Typical use |
|---|---|
| 90 | Preferred for body text |
| 75 | Minimum for body text |
| 60 | Other content text |
| 45 | Large text, headlines, and non-text UI (icons, component edges) |
| 30 | Placeholder text and disabled-like elements |
| 15 | Non-semantic dividers and decoration |

- Polarity is built into the formula. The same pair of colors gives different Lc values when text and background swap.
- Font size and weight change the needed Lc. Thin or small text needs more.
- APCA is not yet a legal standard. Do not use it in place of WCAG 2 when compliance is required. A WCAG 2 check can run alongside it.
- APCA accounts for Stevens' power law, so evenly spaced Lc values tend to look evenly spaced.

Source: colorandcontrast.com/apca/

## Contrast polarity

The contrast relationship between a figure (such as text) and its background.

- **Negative polarity**: dark objects on a light background (light mode).
- **Positive polarity**: light objects on a dark background (dark mode).

People can be more or less sensitive to contrast in each polarity. Positive polarity with very high contrast can cause optical glare.

Note: "display polarity" uses the opposite terms. Light mode has negative contrast polarity but positive display polarity. To avoid confusion, say "dark on light" or "light on dark."

Source: colorandcontrast.com/contrast-polarity/

## Why dark mode needs extra contrast with WCAG 2

WCAG 2 treats both polarities the same. Swapping text and background gives the same ratio. But people do not see them the same way.

Light text on a dark background needs a larger luminance difference to look as clear. A pair that passes 4.5:1 in dark mode often looks weaker than a 4.5:1 pair in light mode. Light text can also blur or glow at its edges because of the irradiation illusion and glare.

Chromagent compensates for this when it uses WCAG 2 contrast. As the background gets darker, it raises each contrast target by a set amount of perceived lightness (CIE L*). Full strength (100%) adds up to 12 L* points; the default strength of 10% adds about 1.2. Subtle steps such as borders and surfaces gain the most, and high-contrast text barely changes. Targets only go up, so a step never drops below its WCAG 2 minimum.

APCA already accounts for polarity in its formula. No extra compensation is needed when using APCA.

Source: colorandcontrast.com/contrast-polarity/, colorandcontrast.com/relative-luminance/

## Contrast sensitivity

A measure of a person's ability to tell an object from its background. It depends on light level and spatial frequency (how fine the detail is). It varies from person to person. Cataracts, optic nerve damage, and age can lower it.

In UI:

- WCAG minimums work for most sighted users, but not all.
- Small text and light font weights need higher contrast.
- Some people need more contrast than the minimums. Others find high contrast painful. Offer contrast settings when possible.
- Support increased contrast settings and Windows high contrast mode.

Source: colorandcontrast.com/contrast-sensitivity/

## Contrast adaptation and discrimination

Contrast adaptation is a process of the visual system to raise or lower contrast sensitivity based on surrounding contrast. It happens in the visual cortex over a matter of seconds.

Contrast discrimination is the ability to tell differences in contrast between objects. "Contrast constancy" is seeing consistent contrast across different backgrounds.

In UI:

- In a mostly low-contrast screen, high-contrast elements stand out more.
- Do not make everything high contrast. People adapt and lose the sense of hierarchy.
- Many high-contrast decorative elements make text and controls harder to find.
- Perceived and calculated contrast may not match between modes. Always confirm the calculated values meet the minimums.

Source: colorandcontrast.com/contrast-adaptation/, colorandcontrast.com/contrast-discrimination/

## Optical glare

The scattering of bright light inside the eye. It happens when light is brighter than the range the eye has adapted to. Screen glare comes from screen brightness or reflections.

In UI: Glare lowers contrast sensitivity and hurts text legibility. Very bright text on pure black can glow and blur. Some people need more contrast and others need less. Offer contrast and lightness settings when possible.

Source: colorandcontrast.com/optical-glare/

## Practical rules

- Check every text and UI color pair. Do not judge contrast by eye.
- Meet WCAG 2 when compliance matters. Use APCA as an extra guide, not a replacement.
- Raise WCAG 2 targets slightly in dark mode, or use APCA, which handles polarity.
- Use the strongest contrast for content, not decoration.
- State the method and target when reporting a contrast value (for example, "4.8:1 WCAG 2" or "Lc 78 APCA").

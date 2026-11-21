# Accessibility and vision

How color vision deficiency and low-vision conditions change what people see, and what each means for UI color.

- Trichromacy
- Color vision deficiency
- Anomalous trichromacy
- Dichromacy
- Monochromacy
- Color confusion lines and color difference
- Low-vision conditions
- Visual acuity and contrast sensitivity loss
- Rules for UI color

## Trichromacy

Color vision where all hues come from mixtures of three primaries (such as red, green, and blue). Most people have three types of cones (color-sensing cells), each sensitive to long (red), medium (green), or short (blue) wavelengths.

Source: colorandcontrast.com/trichromacy/

## Color vision deficiency

Color vision deficiency (CVD, often called "color blindness") is a difference in, or absence of, one or more types of cone. Approximately 8% of males and 0.5% of females have a CVD.

There are three groups: anomalous trichromacy, dichromacy, and monochromacy. Most issues are solved by meeting WCAG 1.4.1 (use of color) and 1.4.3 (contrast minimum).

Source: colorandcontrast.com/color-vision-deficiency/

## Anomalous trichromacy

A type of CVD where one cone type has a shifted wavelength sensitivity. Approximately 6% of males and 0.4% of females are anomalous trichromats. Strength varies from mild to strong.

| Type | Affected cones | Prevalence |
|---|---|---|
| Deuteranomaly | Medium (green) | Most common: 4.63% of men, 0.36% of women |
| Protanomaly | Long (red) | Less common: 1.08% of men, 0.03% of women |
| Tritanomaly | Short (blue) | Very rare: 0.0002% of men |

Simulation tools often show one fixed result per type. Real experience varies, so a simulation can falsely mark colors as "safe."

Source: colorandcontrast.com/anomalous-trichromacy/

## Dichromacy

A type of CVD where one cone type is missing, leaving only two wavelength sensitivities.

| Type | Missing cones | Prevalence |
|---|---|---|
| Deuteranopia | Medium (green) | 1.27% of males, 0.01% of females |
| Protanopia | Long (red) | Less common: 1.01% of males, 0.02% of females |
| Tritanopia | Short (blue) | Very rare: 0.0001% of males |

Red and green confusion (protan and deutan types) is by far the most common. Protan types also see reds as darker.

Source: colorandcontrast.com/dichromacy/

## Monochromacy

A type of vision where only one type of photoreceptor or pigment works. People see little or no hue.

- **Achromatopsia (rod monochromacy)**: inherited. It causes extreme light sensitivity (day blindness) and loss of visual acuity and color discrimination. Very rare: about 0.00002%–0.00003% of people.
- **Blue cone monochromacy**: inherited loss of red and green cone function, with similar effects. Very rare: 0.00001% of people.
- **Cerebral achromatopsia**: color loss from stroke or brain injury.

Most simulators show monochromacy as plain grayscale. They miss the light sensitivity that also lowers contrast sensitivity. Offer contrast settings and support Windows contrast themes.

Source: colorandcontrast.com/monochromacy/

## Color confusion lines and color difference

Color confusion lines are lines on a CIE chromaticity diagram. Colors along one line are hard to tell apart for a given CVD type.

Color difference (Delta E) measures how different two colors look. The latest formula is Delta E 2000. A value of 1 is a "just noticeable difference."

- Confusion lines alone cannot prove colors are "safe."
- Check simulated colors with Delta E for each CVD type when color identity matters.
- Color difference is not a substitute for contrast checks.

Source: colorandcontrast.com/color-confusion-lines/, colorandcontrast.com/color-difference/

## Low-vision conditions

### Cataracts

A condition where the lens of the eye clouds from protein build-up. It often comes with age, injury, or other conditions (like glaucoma). It causes blurred vision, glare, and duller color. Surgery can correct it.

In UI: People may need more contrast or lightness. Support text resizing (WCAG 1.4.4). Larger color differences help but do not guarantee identification.

Source: colorandcontrast.com/cataracts/

### Myopia and hyperopia

Myopia (nearsightedness) blurs distant objects. Hyperopia (farsightedness) blurs nearby objects. Both come from eye shape, and glasses, contacts, or surgery can correct them.

In UI: Both can increase chromatic aberration. Corrective lenses can make it worse. Avoid saturated red and blue together, since they can "vibrate" (chromostereopsis). Support larger text.

Source: colorandcontrast.com/myopia/, colorandcontrast.com/hyperopia/

### Presbyopia

A condition where it becomes difficult to see objects up close. The lens hardens with age. Reading glasses or progressive lenses can treat it.

In UI: People may hold screens farther away, which lowers apparent contrast. Support higher contrast and text resizing.

Source: colorandcontrast.com/presbyopia/

### Astigmatism

An irregular curve in the cornea or lens. Light does not focus properly on the retina. It often comes with myopia or hyperopia.

In UI: It blurs edges and increases glare and chromatic aberration. Light text on dark backgrounds can smear. Avoid saturated red and blue pairs.

Source: colorandcontrast.com/astigmatism/

### Light sensitivity

A condition where bright light hurts the eyes and lowers visual acuity in bright settings. Causes include migraines, eye injury, and some forms of monochromacy. About 80% of people with migraines also have light sensitivity.

In UI: Very high contrast can cause pain or strain. Dark themes can help. Offer lower-contrast options and support Windows contrast themes. Avoid large flashes of bright color.

Source: colorandcontrast.com/light-sensitivity/

## Visual acuity and contrast sensitivity loss

**Visual acuity** is the clarity or sharpness of vision. Myopia, hyperopia, presbyopia, low contrast sensitivity, CVD, and age can all lower it. It affects edge detection, finding components, and reading text.

**Contrast sensitivity** is the ability to tell an object from its background. It varies by person and drops with conditions such as cataracts or optic nerve damage.

In UI: Use higher contrast for small text and light font weights. Support increased contrast and forced colors modes. Offer contrast settings where possible.

Source: colorandcontrast.com/visual-acuity/, colorandcontrast.com/contrast-sensitivity/

## Rules for UI color

- **Never rely on color alone** (WCAG 1.4.1). Pair color with text, icons, patterns, or position.
- **Pair status colors with icons and labels.** An error uses red plus an error icon and message. Success uses green plus a check icon and text.
- **Keep lightness contrast between status colors.** Red and green at the same lightness can look the same to many people. Make them differ in lightness, not only hue.
- **Show links without color alone.** Use underlines, or meet 3:1 against body text with another cue on hover and focus.
- **Mark selected and error states with shape.** Use a thicker border, icon, or check mark, not only a color change.
- **Meet contrast minimums.** Use 4.5:1 for text and 3:1 for non-text UI (WCAG 2).
- **Keep chroma moderate for key distinctions.** Low-chroma colors are harder to tell apart with CVD.
- **Avoid saturated red next to saturated blue**, especially for text.
- **Check palettes for each CVD type** with simulation and Delta E. Treat simulators as a guide, not proof.
- **Respect user settings.** Support `prefers-contrast`, `forced-colors`, and text resizing.
- **Data visualization needs more than color.** Use labels, patterns, and direct annotation.

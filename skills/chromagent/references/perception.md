# Color perception

How people see lightness, chroma, and hue, and the effects that change how a color looks in an interface.

- Color properties
- Effects of lightness and intensity
- Effects of surrounding colors
- Effects over time
- Effects of focus and detail
- How to use this file

## Color properties

Color properties are plain ways to describe a color. A consistent system of properties is a color model.

### Lightness

The amount of lightness of a color, or how close it is to white or black. Changing lightness makes a tint (lighter) or a shade (darker). Lightness, brightness, and value are different measurements in different color spaces.

In UI: Lightness is the main property behind contrast. Basic UI scales are one color at many lightness levels.

Source: colorandcontrast.com/lightness/

### Chroma

The colorfulness of a color, separate from its lightness. Changing chroma makes a tone. Chroma, saturation, and brilliance are different measurements.

In UI: Low-chroma colors are harder to tell apart for people with color vision deficiency (CVD). Keep chroma consistent across the hues in a palette.

Source: colorandcontrast.com/chroma/

### Hue

The named quality of a color, such as "red" or "blue." In color spaces, hue is an angle in degrees.

In UI: The same hue angle means different colors in different spaces. State which space a hue value belongs to.

Source: colorandcontrast.com/hue/

## Effects of lightness and intensity

### Helmholtz–Kohlrausch effect

Higher chroma makes a color look lighter than its measured lightness. Saturated colors seem to glow.

In UI: Do not match colors by eye for lightness. Measure lightness and contrast with a tool. People with CVD may not see this effect.

Source: colorandcontrast.com/helmholtz-kohlrausch-effect/

### Hunt effect

Colors look more colorful as light intensity increases.

In UI: Colors look less colorful on dim screens. Lowering chroma in dark mode can look more natural.

Source: colorandcontrast.com/hunt-effect/

### Bezold–Brücke shift

A color's hue or temperature appears to change as light intensity changes.

In UI: For natural-looking tints, shift cool colors slightly warmer as they get lighter.

Source: colorandcontrast.com/bezold-brucke-shift/

### Abney effect

Colors appear to change in hue as white light is added. A light tint can drift away from the base hue.

In UI: When building tints or scales, shift the hue slightly to keep the light steps looking like the same color. Blues are a common case, since light blues can drift toward purple.

Source: colorandcontrast.com/abney-effect/

### Stevens' power law

The perceived rate of change differs from the actual rate of change. Perception follows a power function, not a straight line.

In UI: Evenly spaced lightness values do not look evenly spaced. Space scale steps by contrast or perceived lightness instead. Always confirm key steps meet WCAG contrast.

Source: colorandcontrast.com/stevens-power-law/

### Purkinje shift

In dim light, the eye's peak sensitivity shifts toward blue. Reds look darker than other colors as light levels drop.

In UI: For natural-looking shades, shift warm colors slightly cooler as they get darker. Reds can lose visibility in dark settings.

Source: colorandcontrast.com/purkinje-shift/

### Irradiation illusion

A light area looks larger than a dark area of the same size. Light scatters in the eye and spreads across the retina. It is often mistakenly called "halation."

In UI: Light text on dark backgrounds looks bolder and larger. In dark mode, consider a lighter font weight. Light icons and borders look thicker, and thin dark gaps look narrower.

Source: colorandcontrast.com/irradiation-illusion/

## Effects of surrounding colors

### Simultaneous contrast

The hue, chroma, or lightness of a color looks different next to other colors. The shifts follow the eye's opponent channels (red–green, blue–yellow, and light–dark).

In UI: A colored background changes how every color on it looks. Sometimes a color can be "fixed" by changing only its surroundings. Do not rely on this effect to tell elements apart, since people with CVD or low contrast sensitivity may not see it.

Source: colorandcontrast.com/simultaneous-contrast/

### Bezold effect

A color's hue, chroma, and lightness can look different when surrounded by different colors. It is related to simultaneous contrast and spatial color mixing.

In UI: The same color looks different in light and dark mode. Dark mode may need its own color values.

Source: colorandcontrast.com/bezold-effect/

### Lateral inhibition

A process that sharpens edges between areas of different luminance. It makes neighboring areas look more different than they are. Related illusions include the Crawford-Stiles effect, where a gray looks lighter near black than near white.

In UI: Judge scale steps side by side, alone, and in a real layout, because neighbors distort them. High-contrast decoration draws attention away from content.

Source: colorandcontrast.com/lateral-inhibition/

### Spatial color mixing

The visual system blends small areas of color into one color. All screen colors are made this way from red, green, and blue pixels.

In UI: Fine patterns, thin lines, and small text blend with the background. Small colored details look less distinct than large areas of the same color.

Source: colorandcontrast.com/spatial-color-mixing/

### Color constancy

The ability to see an object's color as stable under different lighting. It can fail and cause misjudged colors (the "dress" illusion is an example).

In UI: Two different colors can look like one color in context. Do not assume people see the exact values that were set.

Source: colorandcontrast.com/color-constancy/

## Effects over time

### Chromatic adaptation

A process where the eye adjusts to colored light to keep colors looking stable. Cones become less sensitive after long exposure.

In UI: A tinted interface (such as all blue-grays or browns) shifts how other colors look. High-contrast animations and transitions can leave afterimages.

Source: colorandcontrast.com/chromatic-adaptation/

### Successive contrast

A color looks different because of colors seen just before it. It comes from afterimages caused by chromatic adaptation.

In UI: Large color jumps between states can briefly hurt legibility. Strong flashes can cause discomfort or trigger migraines.

Source: colorandcontrast.com/successive-contrast/

## Effects of focus and detail

### Chromostereopsis

An illusion of depth or "vibration" when certain colors sit side by side. It comes from chromatic aberration (the eye focuses different wavelengths at different depths).

In UI: Never pair saturated red and blue for text and background. Avoid placing high-chroma spectral colors next to each other. Corrective lenses and dark themes can make it worse.

Source: colorandcontrast.com/chromostereopsis/

## How to use this file

- Measure, then judge. Use the engine for lightness and contrast, then check by eye in context.
- Expect the same color to look different on light and dark backgrounds.
- Small hue shifts across a scale can keep light and dark steps looking like one color.

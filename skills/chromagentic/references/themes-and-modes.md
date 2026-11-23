# Themes and modes

How color themes support light, dark, and contrast modes, and how Chromagentic builds every mode from a few global settings.

- Color themes
- Light mode and dark mode
- High contrast mode (forced colors)
- Increased contrast mode
- Low contrast preference
- Adaptive themes and personalization
- Adaptation, light sensitivity, and glare
- The Chromagentic approach
- Six default schemes
- Matching the project's theme switch
- Personal colors
- Typical values

## Color themes

A color theme is a collection of color scales applied to an interface. Themes can support light mode, dark mode, increased contrast, or different brands.

Creating a theme brings every color and variation into one consistent system. Name colors by role (such as "text-primary" or "border-subtle"), not by value. Then each mode can supply its own values for the same roles.

Source: colorandcontrast.com/color-theme/, colorandcontrast.com/creating-a-theme/

## Light mode and dark mode

Light mode is a device-specific color mode that shows whites and light grays in most apps. Dark mode is a device-specific color mode that shows dark grays in most apps. On the web, match them with the `prefers-color-scheme: light` and `prefers-color-scheme: dark` media queries.

- Colors look different on light and dark backgrounds (Bezold effect and simultaneous contrast). Do not reuse light-mode values in dark mode.
- Saturated colors can look too intense on dark backgrounds. Slightly lower chroma often looks more natural (Hunt effect).
- Light text on dark looks bolder (irradiation illusion). A lighter font weight can help.
- Translucent colors need higher opacity in dark mode for the same visual weight.
- Either mode can cause eye strain or migraines when contrast is too high or for people with light sensitivity.

Source: colorandcontrast.com/light-mode/, colorandcontrast.com/dark-mode/

## High contrast mode (forced colors)

Windows contrast themes (formerly "high contrast mode") are a device-specific color mode. They replace site colors with a small set of colors the user chooses. People with low vision rely on them for visibility. People with light sensitivity may use them to lower contrast.

Do not design a custom theme for this mode. The user is in control of color. Instead:

- Detect it with the `forced-colors: active` media query.
- Use CSS system colors so components map to the user's palette:
  - `Canvas` (background) and `CanvasText` (default text)
  - `ButtonFace` (button background) and `ButtonText` (button text)
  - `Highlight` (selected background) and `HighlightText` (selected text)
  - `LinkText` (links) and `GrayText` (disabled text)
- Keep real borders and outlines. Backgrounds and shadows may be removed, so a focus ring or border may be the only cue left.
- Avoid `forced-color-adjust: none` except where colors carry essential meaning (such as a color swatch).
- Combine with `prefers-color-scheme` to tell whether the user's theme is light or dark.

Supporting this mode is strongly recommended.

Source: colorandcontrast.com/high-contrast-mode/

## Increased contrast mode

Increase contrast mode is a device-specific color mode that shows colors with higher contrast in most apps. Examples include "Increase contrast" on macOS and iOS. On the web, match it with `prefers-contrast: more`.

Unlike forced colors, the site keeps its own palette. Provide a theme with stronger contrast for text, borders, and focus indicators. People with low vision rely on this mode.

Source: colorandcontrast.com/increase-contrast-mode/

## Low contrast preference

Some people find high contrast painful, such as people with light sensitivity or migraines. The `prefers-contrast: less` media query signals this preference.

A lower-contrast theme can soften text and reduce harsh edges. It is an opt-in for people who ask for it. Keep the default theme at or above the WCAG minimums.

## Adaptive themes and personalization

An adaptive color theme has options that people can adjust, such as contrast, lightness, and saturation. Each option affects every color in the theme.

- Higher contrast helps people who need more than WCAG 1.4.3 provides.
- Lower contrast and lightness help people with light sensitivity.
- Lower saturation helps people who are bothered by vivid colors.

Personalization gives more people a good experience than one fixed theme can. WCAG sets a floor, not a perfect fit.

Source: colorandcontrast.com/adaptive-color-theme/, colorandcontrast.com/personalization/

## Adaptation, light sensitivity, and glare

**Light and dark adaptation** is a process of the visual system to raise or lower light sensitivity in response to surrounding light. Color appearance also changes with light level (Hunt effect, Bezold–Brücke shift, and, in very dim light, the Purkinje shift). Many devices adjust brightness for ambient light, but settings still help.

**Dynamic range** is the difference between the lightest and darkest areas in a view. Large changes in it can hurt legibility.

**Light sensitivity** is a condition where bright light hurts the eyes and lowers visual acuity. About 80% of people who have migraines also have light sensitivity. Dark themes can help by emitting less light.

**Irradiation and glare**: light areas on dark backgrounds look larger and can glow. Very bright text on pure black can blur or "smear" for some people, especially people with astigmatism.

Source: colorandcontrast.com/light-and-dark-adaptation/, colorandcontrast.com/light-sensitivity/, colorandcontrast.com/optical-glare/

## The Chromagentic approach

Chromagentic does not hand-pick colors for each mode. Each scale step is defined by its contrast against the background. A mode is made by changing a few global settings:

- **Background lightness** sets light or dark mode. Every step is recalculated against the new background.
- **Contrast multiplier** sets regular, high, or low contrast. It scales every step's contrast target.
- **Polarity compensation strength** adds extra contrast in dark mode when using WCAG 2. The default is 10%. APCA does not need it.

This keeps the theme consistent. A token like "text-secondary" has the same job and the same relative contrast in every mode. Adding a new mode means choosing new settings, not repainting the palette.

When explaining a theme, describe these settings in plain words. For example: "Dark mode uses a near-black background, with subtle steps given a little extra contrast so they look as clear as in light mode."

## Six default schemes

New apps should ship light and dark color schemes, each with regular (default), high, and low contrast. Chromagentic makes all six by default: `light`, `dark`, `light-high-contrast`, `dark-high-contrast`, `light-low-contrast`, and `dark-low-contrast`. Existing projects keep the modes they have unless the user asks for more.

For a new app, also ask whether people should be able to choose their own lightness and contrast (see "Personal colors"). If you can't wait for the answer, finish your reply with that question.

The generated CSS switches them in two ways:

- **System settings:** `prefers-color-scheme: dark`, `prefers-contrast: more`, and `prefers-contrast: less`.
- **Attributes:** `data-theme="light"` or `"dark"` picks the theme, and `data-contrast="more"`, `"less"`, or `"normal"` picks the contrast. An attribute beats the system setting, and `normal` ignores the system contrast preference.

Low-contrast modes can come out close to regular ones, because the floors (text 4.5:1, borders 3:1) stop them from going lower.

## Matching the project's theme switch

Find how the project already switches themes and connect the generated modes to it. Don't add a second switch.

| Project uses | Do this |
|---|---|
| Only system settings | Nothing extra: the media queries handle it |
| `data-theme` attribute | Use it as is; add `data-contrast` for the contrast choice |
| A `dark` class (`<html class="dark">`) | Set `data-theme="dark"` (and remove it for light) in the same code that toggles the class. Keep the class if other styles use it |
| Tailwind `dark:` variant | Tailwind v4: `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`. Tailwind v3: `darkMode: ["selector", '[data-theme="dark"]']`. Role utilities (`bg-accent`) already switch, so `dark:` is rarely needed |
| A theme toggle in JavaScript | Set `document.documentElement.dataset.theme` and `.dataset.contrast`, and save the choice |
| SwiftUI or UIKit | Asset catalog color sets with dark and high-contrast appearances (`references/platforms.md`) |
| Android | `values-night` resources, or Compose color schemes chosen with `isSystemInDarkTheme()` and the contrast setting |

Colors for a theme that people switch to should be a "color table": one row per role, one column per scheme. Show it to the user when explaining.

## Personal colors

Some people need more contrast than the high-contrast scheme gives, or a softer, darker background than the dark scheme. Personalization lets them choose.

Always ask the user before adding it. If they want it, use the runtime (`<skill-dir>/scripts/chromagentic-runtime.mjs`, or `chromagentic/runtime` from npm). It regenerates the same roles live from two choices: background lightness (0–1) and contrast (0.5–2). It writes the same CSS variables as the static CSS, so components don't change, and the floors still hold. Keep the six static schemes loaded as the fallback for people who don't personalize and for when scripts don't run. Save the choice (for example in `localStorage`) and apply it on load. For a slider, create one personalizer and apply each change to it (it checks the settings once and remembers recent choices). See `<skill-dir>/assets/personalize-example.html`, and the code in `references/engine.md`, "JavaScript API".

The runtime is about 90 KB (about 35 KB compressed). Load it only on pages with the settings control, or after the page has loaded.

## Typical values

| Mode | Background lightness (0–1) | Contrast multiplier |
|---|---|---|
| Light | 1 (white), or about 0.97–1 | 1 |
| Dark | About 0.12–0.2 (default 0.15) | 1, with polarity compensation |
| High or increased contrast | Same as light or dark | About 1.5–2 |
| Low contrast | Same as light or dark | About 0.7–0.85 |

- Avoid pure black for large dark surfaces. It increases glare and the irradiation illusion around light text.
- Pure black can suit OLED screens when saving power matters.
- A slightly off-white light background (about 0.97–0.99) can reduce glare.
- For low contrast, check that text still meets a usable level. Treat it as a user choice, not the default.
- Pair each mode with its media query: `prefers-color-scheme`, `prefers-contrast: more`, and `prefers-contrast: less`. Use system colors for `forced-colors: active`.

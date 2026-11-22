# Platforms

How to find what a project is built with, and how to turn Chromagentic output into that platform's color format.

- Finding the stack
- Gamut rules
- Web CSS
- Tailwind CSS
- Design tokens (DTCG)
- iOS, macOS, and visionOS (SwiftUI and UIKit)
- Android (Jetpack Compose and XML views)
- Flutter, React Native, and email
- Other formats

## Finding the stack

Check the project before generating colors. Match the strongest signal.

| Signal | Stack | Use |
|---|---|---|
| `tailwindcss` 4 in `package.json`, or `@import "tailwindcss"` in CSS | Tailwind v4 | `--platform tailwind --format tailwind` |
| `tailwind.config.js` with `tailwindcss` 3 | Tailwind v3 | `--platform web --format css`, then map in the config |
| `*.tokens.json`, `$value` or `$type` keys, Style Dictionary, Tokens Studio | Design tokens | `--platform dtcg --format dtcg` |
| `*.css`, `*.scss`, or CSS-in-JS with custom properties | Web CSS | `--platform web --format css` |
| `*.swift`, `*.xcodeproj`, `Package.swift`, `Assets.xcassets` | Apple platforms | `--platform ios --format json` |
| `build.gradle(.kts)` with Compose, `@Composable` | Jetpack Compose | `--platform compose --format json` |
| `res/values/colors.xml` without Compose | Android XML views | `--platform legacy --format json` |
| `pubspec.yaml` | Flutter | `--platform flutter --format json` |
| `react-native` in `package.json` | React Native | `--platform react-native --format json` |
| HTML email templates (MJML, inline styles) | Email | `--platform email --format css` |

If the project already has color files, generate into the same place and keep their naming style. If the stack is unclear, ask the user.

## Gamut rules

- **Web (CSS, Tailwind, tokens):** keep wide-gamut OKLCH (`rec2020` gamut, `oklch` format). Browsers map colors to each screen.
- **Display P3:** only for platforms built around it: iOS, macOS, visionOS, and Android with Compose. Colors are written as P3 red, green, and blue values.
- **sRGB hex:** only for older tech: email, Flutter, React Native, Android XML views, and old browsers.

`--platform` sets the gamut and format. The engine measures contrast on the final mapped color, so the results stay accurate.

Use the `css` field for exact values. The `hex` field is an sRGB fallback; don't use it on P3 platforms.

## Web CSS

```sh
chromagentic generate chromagentic.theme.json --platform web --out src/styles/colors.css
```

Import the file once, before other styles. Use roles in components: `color: var(--color-text); background: var(--color-surface-raised);`. Modes follow the system settings through media queries. To let users pick a mode, set `data-theme="dark"` (or any mode name) on `<html>`, and `data-contrast="more"` or `"less"` for contrast; they override the media queries. If the project already toggles a class or uses Tailwind's `dark:` variant, connect it as described in `references/themes-and-modes.md`.

## Tailwind CSS

**Tailwind v4:**

```sh
chromagentic generate chromagentic.theme.json --platform tailwind --format tailwind --out src/styles/colors.css
```

Import it after Tailwind: `@import "tailwindcss"; @import "./colors.css";`. The default mode goes in `@theme`, so Tailwind makes utilities such as `bg-accent`, `text-text-subtle`, `border-border`, and `bg-surface-raised`. Other modes override the same variables. Chromagentic scales named `gray`, `red`, `orange`, `green`, or `blue` replace Tailwind's palettes of the same name. Use different scale names to keep Tailwind's.

**Tailwind v3:** generate CSS, import it, and point the config at the variables:

```js
theme: { extend: { colors: { text: "var(--color-text)", accent: "var(--color-accent)", /* one per role */ } } }
```

## Design tokens (DTCG)

```sh
chromagentic generate chromagentic.theme.json --platform dtcg --format dtcg --out tokens/color
```

This writes one `<mode>.tokens.json` per mode. Each role is a color token with OKLCH components and a hex fallback (`{"colorSpace":"oklch","components":[…],"hex":"#…"}`). With `"steps": true`, scale steps are tokens too and roles become aliases such as `{color.gray.1400}`. Contrast details are stored under `$extensions.chromagentic`. Tools like Style Dictionary can build these into platform files. Use one file per mode as a theme or mode set.

Keep this OKLCH value format even when the existing token files use plain hex strings. Don't write your own script that converts the engine's colors to hex. To keep the project's token names, map them to roles in `chromagentic.theme.json` (or rename the generated tokens) and update every mode file the same way, old modes included.

## iOS, macOS, and visionOS (SwiftUI and UIKit)

```sh
chromagentic generate chromagentic.theme.json --platform ios --format json --out chromagentic.colors.json
```

Each color's `css` is `color(display-p3 r g b)`. Use those numbers.

The best match is an asset catalog color set, because the system switches appearance and contrast for you. In `Assets.xcassets/Text.colorset/Contents.json`, add one entry per mode with `"color-space": "display-p3"`, and mark the dark mode with `"appearances": [{ "appearance": "luminosity", "value": "dark" }]`. Mark high-contrast modes with `{ "appearance": "contrast", "value": "high" }`. Then use `Color("Text")` in SwiftUI or `UIColor(named: "Text")` in UIKit.

In code, use `Color(.displayP3, red: r, green: g, blue: b)` and pick the mode with `@Environment(\.colorScheme)` and `@Environment(\.colorSchemeContrast)`.

Generate one color set per role, not per scale step, unless the project needs the full scales.

## Android (Jetpack Compose and XML views)

```sh
chromagentic generate chromagentic.theme.json --platform compose --format json --out chromagentic.colors.json
```

Use the P3 numbers: `Color(red = r, green = g, blue = b, colorSpace = ColorSpaces.DisplayP3)`. Display P3 colors need Android 8 (API 26) or newer. Make one object per mode, and choose with `isSystemInDarkTheme()`. Android 14 adds a contrast setting (`UiModeManager.getContrast()`) for choosing a high-contrast mode. Expose roles through a `CompositionLocal` or map them onto Material `ColorScheme` slots (`primary` from `accent`, `onPrimary` from `text-on-accent`, `background` and `surface` from surfaces, `error` from `error`).

XML views (`colors.xml`) take sRGB hex only. Use `--platform legacy`, and put dark colors in `values-night/colors.xml`.

## Flutter, React Native, and email

These use sRGB hex.

- **Flutter:** `Color(0xFFRRGGBB)` from each `hex`. Build a `ThemeData` per mode, or a `ThemeExtension` for roles, and choose with `MediaQuery.platformBrightnessOf` and `MediaQuery.highContrastOf`.
- **React Native:** a JavaScript object per mode, chosen with `useColorScheme()`.
- **Email:** inline hex values. Many email apps ignore or override dark mode, so make sure the light colors still work if inverted. Use `@media (prefers-color-scheme: dark)` only as an extra.

## Other formats

For SCSS, CSS-in-JS, Figma variables, or anything else, generate `--format json` and convert it. Keep the role names and mode names. Copy the values exactly; don't round or adjust them, because that can break the contrast targets.

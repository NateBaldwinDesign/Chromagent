---
name: chromagent
description: Color for user interfaces. Use when creating or changing UI colors, palettes, color scales, themes, dark mode, high or low contrast modes, brand or accent colors, text and border colors, status colors, or component states, when checking color contrast or accessibility, or when turning mood words ("calm", "bright and vivid") into colors.
---

# Chromagent

Chromagent is a color engine plus color knowledge for user interfaces. It makes colors from contrast targets, measured the way people see color, so every color has a known contrast in every mode.

## Rules

1. **Use the engine for every color value.** Don't write hex, RGB, or OKLCH values by hand, and don't guess contrast. Generate colors with `chromagent generate` (or `generateTheme`), and measure any color you didn't generate with `chromagent contrast`.
2. **Keep one settings file.** Save the settings as `chromagent.theme.json` in the project, and generate the color files from it. To change colors later, edit the settings and generate again. Don't edit the generated output.
3. **Build modes from global settings.** Light, dark, high-contrast, and low-contrast modes come from three settings per mode: `backgroundLightness`, `contrastMultiplier`, and `polarityCompensation`. Don't hand-tune colors for a mode.
4. **Fit the project's stack.** Find what the project is built with before generating, and use the matching `--platform` and `--format`. See `references/platforms.md`.
5. **Use roles, not raw steps, in components.** Point components at roles like `text`, `border`, and `accent`. Roles keep their job in every mode.
6. **Report problems.** If the engine warns that a target can't be reached, tell the user and fix the settings. Don't hide the warning.

## Workflow

1. **Find the stack.** Look for `package.json`, Tailwind, token files, `*.swift`, `build.gradle`, and existing color files (`references/platforms.md`).
2. **Choose key colors.** Use the user's brand colors when they exist. For words like "calm and earthy", run `chromagent suggest "calm and earthy"`, pick from the results, then check the pick with `chromagent describe <color>` (`references/choosing-colors.md`).
3. **Write `chromagent.theme.json`.** Start small: key colors plus the modes needed. Defaults cover steps, surfaces, roles, and status colors (`references/engine.md`).
4. **Generate.** For example: `npx chromagent generate chromagent.theme.json --platform web --out src/styles/colors.css`.
5. **Wire it in.** Use the generated variables or tokens in components, and switch modes with the system setting (media queries) or a `data-theme` attribute.
6. **Explain.** Tell the user, in plain words, what each color is for and how each mode differs. Mention the contrast targets.

## Settings to choose

- **Contrast formula:** `wcag2` (the default, and what most laws and audits use) or `apca` (follows perception more closely, but isn't a standard yet). Use APCA only when the user asks for it.
- **Polarity compensation:** extra contrast on dark backgrounds, because light text on dark looks weaker than the same WCAG ratio suggests. Default `0.1` (10%). Use about `0.15`–`0.25` for text-heavy products or older audiences, and `0` only to match an existing design exactly. APCA ignores it.
- **Contrast multiplier:** `1` for normal modes. Use about `1.5`–`2` for high contrast and about `0.7`–`0.85` for low contrast.
- **Background lightness:** about `0.97`–`1` for light mode and about `0.08`–`0.2` for dark mode. Avoid pure black for large dark surfaces.
- **Gamut:** wide gamut (OKLCH) for the web. Use Display P3 only for platforms bound to it (iOS, macOS, Android), and sRGB hex only for older tech (email, Flutter, React Native). `--platform` sets this for you.

## Reference files

Open a file only when the task needs it.

| File | Open it when |
|---|---|
| `references/engine.md` | Writing settings or calling the API or command-line tool |
| `references/platforms.md` | Finding the stack and choosing output format and gamut |
| `references/themes-and-modes.md` | Adding light, dark, high-contrast, or low-contrast modes |
| `references/contrast.md` | Explaining WCAG 2, APCA, polarity, or contrast problems |
| `references/scales.md` | Designing color scales and picking steps for components |
| `references/choosing-colors.md` | Choosing key colors, harmonies, or colors from mood words |
| `references/accessibility.md` | Color vision deficiency, low vision, or not relying on color alone |
| `references/color-spaces-and-gamut.md` | OKLCH, P3, sRGB, gamut mapping, or interpolation |
| `references/perception.md` | Explaining why colors look different in context |

## Out of scope (for now)

Chromagent doesn't generate data-visualization palettes or transparent (opacity) colors yet. If asked, explain this, give general guidance from the reference files, and measure any colors you choose with `chromagent contrast`.

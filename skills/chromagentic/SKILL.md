---
name: chromagentic
description: Makes accessible, perceptually balanced UI colors with a bundled color engine instead of guessing hex values. Use when creating a color system, palette, or theme from a prompt or brand color; converting an existing light theme to dark mode or a dark theme to light mode; adding high-contrast or low-contrast modes; fixing or checking color contrast (WCAG 2 or APCA); making a brand color accessible; picking text, border, surface, status, or button-state colors; or turning mood words like "calm and earthy" or "bright and vivid" into colors. Outputs CSS variables, Tailwind v4, design tokens (DTCG), or values for SwiftUI and Android.
license: Apache-2.0
compatibility: Requires Node.js 20+
metadata:
  version: "0.2.0"
---


# Chromagentic

Chromagentic is a color engine plus color knowledge for user interfaces. It makes colors from contrast targets, measured the way people see color, so every color has a known contrast in every mode.

## Running the engine

The engine is one file inside this skill: `scripts/chromagentic.mjs`. It works offline with Node.js 20+ and needs no install. `<skill-dir>` is the folder that holds this SKILL.md, such as `.agents/skills/chromagentic`, `.github/skills/chromagentic`, or `.claude/skills/chromagentic` in the project, or the same path under your home folder.

```sh
node <skill-dir>/scripts/chromagentic.mjs generate chromagentic.theme.json --platform web --out src/styles/colors.css
```

In this guide, `chromagentic <command>` means `node <skill-dir>/scripts/chromagentic.mjs <command>`. If the project has the `chromagentic` npm package installed, `npx chromagentic <command>` works too. The settings schema and example settings are in `<skill-dir>/assets/`.

## Rules

1. **Use the engine for every color value.** Don't write hex, RGB, or OKLCH values by hand, and don't guess contrast. Generate colors with `chromagentic generate`, and measure any color you didn't generate with `chromagentic contrast`.
2. **Keep one settings file.** Save the settings as `chromagentic.theme.json` in the project, and generate the color files from it. To change colors later, edit the settings and generate again. Don't edit the generated output.
3. **Build modes from global settings.** Light, dark, high-contrast, and low-contrast modes come from three settings per mode: `backgroundLightness`, `contrastMultiplier`, and `polarityCompensation`. Don't hand-tune colors for a mode. When adding a mode to a project that already has light or dark colors, put every mode (old and new) in the settings file and regenerate them all together, so they come from one system.
4. **Fit the project's stack.** Find what the project is built with before generating, and use the matching `--platform` and `--format`. See `references/platforms.md`.
5. **Use roles, not raw steps, in components.** Point components at roles like `text`, `border`, and `accent`. Roles keep their job in every mode.
6. **Report problems.** If the engine warns that a target can't be reached, tell the user and fix the settings. Don't hide the warning.

## Workflow

1. **Find the stack.** Look for `package.json`, Tailwind, token files, `*.swift`, `build.gradle`, and existing color files (`references/platforms.md`).
2. **Choose key colors.** Use the user's brand colors when they exist. For words like "calm and earthy", run `chromagentic suggest "calm and earthy"`, pick from the results, then check the pick with `chromagentic describe <color>` (`references/choosing-colors.md`).
3. **Write `chromagentic.theme.json`.** Start small: key colors plus the modes needed. Defaults cover steps, surfaces, roles, and status colors (`references/engine.md`).
4. **Generate.** Run `chromagentic generate` with the matching `--platform` (see "Running the engine").
5. **Wire it in.** Use the generated variables or tokens in components, and switch modes with the system setting (media queries) or a `data-theme` attribute. Roles are measured against the page background. Where text or a border sits on a raised surface or a colored fill instead, check it with `chromagentic contrast`, and use the next stronger role or step if it falls short.
6. **Explain.** Tell the user, in plain words, what each color is for and how each mode differs. Mention the contrast targets.

## Converting a mode (light to dark, or dark to light)

When the project already has one mode, the new mode must match it, and the original must keep looking the same.

1. **Read the existing colors.** Find the background, text, subtle text, border, and brand or accent colors, and note which variable names components use.
2. **Measure them.** Run `chromagentic contrast <color> <background>` for each one.
3. **Use them as the system.** Make the original colors the key colors (for example a gray scale with the border, subtle text, and text colors as its keys, and the brand color as its own scale). Set `steps` to the measured contrasts with names like `"text": 15.2`, and point roles at them (`"text": "gray.text"`). Set the original mode's `backgroundLightness` to match its background.
4. **Generate both modes together** from that one settings file. The original mode comes back almost identical, and the new mode gets the same contrast for each role. Typical new-mode backgrounds: `0.1`–`0.15` for dark, `0.97`–`1` for light.
5. **Check the original mode.** Compare its generated values with the old ones. If any color changed visibly, fix the settings, or keep the old value for the original mode.
6. **Keep the old names.** Map the project's existing variables onto the generated roles (for example `--text: var(--color-text)`) so components don't change, and switch modes with `prefers-color-scheme` and a class or `data-theme` attribute.

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

Chromagentic doesn't generate data-visualization palettes or transparent (opacity) colors yet. If asked, explain this, give general guidance from the reference files, and measure any colors you choose with `chromagentic contrast`.

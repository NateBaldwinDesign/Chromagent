---
name: chromagentic
description: Makes accessible, perceptually balanced UI colors with a bundled color engine instead of guessing hex values. Starts from semantic roles (text tiers, borders, brand or accent, button states, feedback colors) rather than a full value scale. Use when creating UI colors, a color system, palette, or theme from a prompt or brand color; converting a light theme to dark mode or dark to light; adding high-contrast or low-contrast modes; fixing or checking color contrast (WCAG 2 or APCA); making a brand color accessible; picking text hierarchy, border, accent, hover, focus, or text-on-button colors; choosing error, success, warning, and info colors that stay distinct for color-blind users; letting people personalize colors; or turning mood words like "calm and earthy" into colors. Outputs CSS variables, Tailwind v4, design tokens (DTCG), or values for SwiftUI and Android.
license: Apache-2.0
compatibility: Requires Node.js 20+
metadata:
  version: "0.2.0"
---

# Chromagentic

Chromagentic is a color engine plus color knowledge for user interfaces. It makes colors from contrast targets, measured the way people see color, so every color has a known contrast in every mode.

**UI colors are not a full value scale.** Start with the few semantic roles the interface needs (text, borders, accent, states, feedback). Add more roles, or a fuller scale, only when the project needs them.

## Running the engine

The engine is one file inside this skill: `scripts/chromagentic.mjs`. It works offline with Node.js 20+ and needs no install. `<skill-dir>` is the folder that holds this SKILL.md, such as `.agents/skills/chromagentic`, `.github/skills/chromagentic`, or `.claude/skills/chromagentic` in the project, or the same path under your home folder.

```sh
node <skill-dir>/scripts/chromagentic.mjs generate chromagentic.theme.json --platform web --out src/styles/colors.css
```

In this guide, `chromagentic <command>` means `node <skill-dir>/scripts/chromagentic.mjs <command>`. If the project has the `chromagentic` npm package installed, `npx chromagentic <command>` works too. The settings schema and examples are in `<skill-dir>/assets/`.

## Rules

1. **Use the engine for every color value.** Don't write hex, RGB, or OKLCH values by hand, and don't guess contrast. Generate colors with `chromagentic generate`, and measure any color you didn't generate with `chromagentic contrast`.
2. **Start from roles, not scales.** Declare roles by intent in `chromagentic.theme.json` (`references/semantic-roles.md`). Leave `steps` out unless the project really needs a full scale (`references/scales.md`).
3. **Keep one settings file.** Generate color files from `chromagentic.theme.json`. To change colors, edit the settings and generate again. Don't edit the generated output.
4. **Build modes from global settings.** Every mode comes from `backgroundLightness`, `contrastMultiplier`, and `polarityCompensation`. Don't hand-tune colors per mode. When adding a mode to an existing project, put every mode (old and new) in the settings and regenerate them together.
5. **Fit the project's stack and theme switch.** Find what the project is built with and how it switches themes, and use the matching `--platform`, `--format`, and selectors (`references/platforms.md`).
6. **Keep the floors.** Text 4.5:1, borders and icons 3:1, accent 3:1 against the background, and text on an accent 4.5:1. The engine never goes below them.
7. **Report problems.** If the engine warns that a target can't be reached, or that feedback colors are too similar for color-blind users, tell the user and fix the settings. Don't hide warnings.

## Workflow

1. **Find the stack.** Look for `package.json`, Tailwind, token files, `*.swift`, `build.gradle`, existing color files, and how themes switch (`prefers-color-scheme`, a `dark` class, `data-theme`, Tailwind `dark:` variants, asset catalogs, `values-night`).
2. **List the roles the interface needs.** Base this on the information architecture: how much text hierarchy, which interactive elements, and whether there are forms or status messages. Small apps often need only `text`, `text-subtle`, `border`, `accent`, `accent-hover`, and `text-on-accent`.
3. **Choose key colors.** Use the user's brand colors when they exist. For mood words, run `chromagentic suggest "calm and earthy"`, pick from the results, then check the pick with `chromagentic describe <color>` (`references/choosing-colors.md`).
4. **Ask about personalization.** For new apps, ask the user whether people should be able to choose their own lightness and contrast. Only add the runtime if they say yes (see "Personal colors").
5. **Write `chromagentic.theme.json`.** Key colors, roles, and (for new apps) the six default schemes. Add `"status": true` when the app shows errors, validation, or notices.
6. **Generate** with the matching `--platform` and `--format`.
7. **Wire it in.** Use role variables in components (`var(--color-text)`), not raw values. Connect the modes to the project's theme switch. Roles are measured against the page background; for text on a raised surface or a colored fill, check with `chromagentic contrast` and use the next stronger role if it falls short.
8. **Explain.** Tell the user, in plain words, what each role is for, how each mode differs, the contrast targets, and any target the engine moved to keep steps even.

## Roles in brief

Full details are in `references/semantic-roles.md`.

| Role | Target | Use |
|---|---|---|
| `text-subtle` | ≈4.5:1 (minimum 4.5) | Descriptions, metadata, eyebrow headings |
| `text-strong` | ≈7.5:1 (optional) | Default body text when more hierarchy is needed |
| `text` (strongest) | ≈12:1, or the most the mode allows | Default text when no extra hierarchy is needed; otherwise titles, headings, calls to action |
| `border` | 3:1 | Input borders, dividers that must be seen, focus rings |
| `accent` | ≥3:1, lightness picked from the brand hue | Buttons, selected states, focus, links: where attention is needed |
| `text-on-accent` | ≥4.5:1 on the accent | Label on accent fills: white, black, or the background, whichever passes with the least change |
| states (`-hover`, `-active`, `-selected`, `-focus`) | Small even contrast steps | Interaction states |
| `error`, `success`, `warning`, `info` | ≥4.5:1, distinct for color-blind users | Validation, errors, notices (`references/feedback-colors.md`) |

- **Accent lightness follows the hue.** The engine keeps the accent as close to the brand color as entered as the limits allow. An orange stays light (around 3:1) with dark text on it; a deep purple stays deep (around 6–7:1) with white text.
- **Even spacing.** The engine spreads all role and state targets into equal lightness steps, so the colors fill out a consistent, perceptually even set. This can raise a target (never below its floor). It lists each moved target in a note; mention them.
- **Hierarchy follows need.** Don't add `text-strong` or extra states unless the design uses them.

## Schemes and theme switching

New apps get six schemes by default: light and dark, each with regular, high (`prefers-contrast: more`), and low (`prefers-contrast: less`) contrast. The CSS follows system settings, and also `data-theme="light|dark"` and `data-contrast="more|less|normal"` on any element. Match the project's existing switch: map a `dark` class or Tailwind variant onto these attributes, or use asset catalog and `values-night` color sets on Apple and Android (`references/themes-and-modes.md`). Existing projects keep their current modes unless the user asks for more.

## Converting a mode (light to dark, or dark to light)

The new mode must match the existing one, and the original must keep looking the same.

1. **Read the existing colors.** Find the background, text, subtle text, border, and brand or accent colors, and the variable names components use.
2. **Measure them** with `chromagentic contrast <color> <background>`.
3. **Use them as the system.** Make the original colors key colors (for example a gray scale keyed on the border, subtle text, and text colors, plus the brand). Set `steps` to the measured contrasts with names like `"text": 15.2`, and point roles at them (`"text": "gray.text"`). Set the original mode's `backgroundLightness` to match its background. See the recipe in `references/engine.md`.
4. **Generate both modes together.** The original comes back almost identical, and the new mode gets the same contrast for each role. Typical new backgrounds: `0.1`–`0.15` for dark, `0.97`–`1` for light.
5. **Check the original.** Compare generated values with the old ones; if any changed visibly, fix the settings.
6. **Keep the old names** (`--text: var(--color-text)`) and the project's switch (media query, class, or `data-theme`).

## Feedback colors

When the app has validation, errors, or notices, set `"status": true`. The engine picks error, success, warning, and info hues in harmony with the brand (matching its chroma), then adjusts lightness, hue, and chroma until every pair differs by ΔE 2000 ≥ 11 in normal vision and in protan, deutan, and tritan simulations, while keeping contrast floors. Preview with `chromagentic feedback <brand>`; check any set with `chromagentic check-cvd error=<c> success=<c> …`. Still pair color with an icon or text. See `references/feedback-colors.md`.

## Personal colors (ask first)

If the user wants people to choose their own colors, add the runtime: `<skill-dir>/scripts/chromagentic-runtime.mjs` (or `chromagentic/runtime` from npm). `personalize(config, { backgroundLightness, contrast })` regenerates the same roles live and writes CSS variables; floors still hold. Keep the static schemes as the fallback, and save the choice (see `<skill-dir>/assets/personalize-example.html`). Never add it without asking.

## Settings to choose

- **Contrast formula:** `wcag2` (default; what most laws and audits use) or `apca` (closer to perception, not yet a standard). Use APCA only when asked.
- **Polarity compensation:** extra contrast on dark backgrounds, because light-on-dark looks weaker than its WCAG ratio. Default `0.1`; about `0.15`–`0.25` for text-heavy products or older audiences; `0` only to match an existing design exactly.
- **Contrast multiplier:** `1` normal, about `1.5`–`2` high, about `0.7`–`0.85` low.
- **Background lightness:** about `0.97`–`1` light, `0.08`–`0.2` dark. Avoid pure black for large surfaces.
- **Gamut:** wide gamut (OKLCH) for the web; Display P3 only for platforms bound to it (iOS, macOS, Android); sRGB hex only for older tech (email, Flutter, React Native). `--platform` sets this.

## Reference files

Open a file only when the task needs it.

| File | Open it when |
|---|---|
| `references/semantic-roles.md` | Choosing roles, text tiers, accent, states, and spacing |
| `references/engine.md` | Writing settings or calling the API or command-line tool |
| `references/platforms.md` | Finding the stack, theme switch, output format, and gamut |
| `references/themes-and-modes.md` | Light, dark, high- or low-contrast schemes, or personalization |
| `references/feedback-colors.md` | Error, success, warning, info colors and color-blind checks |
| `references/contrast.md` | Explaining WCAG 2, APCA, polarity, or contrast problems |
| `references/scales.md` | When a project needs a full value scale |
| `references/choosing-colors.md` | Choosing key colors, harmonies, or colors from mood words |
| `references/accessibility.md` | Color vision deficiency, low vision, or not relying on color alone |
| `references/color-spaces-and-gamut.md` | OKLCH, P3, sRGB, gamut mapping, or interpolation |
| `references/perception.md` | Explaining why colors look different in context |

## Out of scope (for now)

Chromagentic doesn't generate data-visualization palettes or transparent (opacity) colors yet. If asked, explain this, give general guidance from the reference files, and measure any colors you choose with `chromagentic contrast`.

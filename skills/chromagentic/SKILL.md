---
name: chromagentic
description: Generates accessible, perceptually balanced UI colors with a bundled engine instead of hand-picked hex values. Use when creating or changing UI colors, palettes, themes, or color tokens; adding dark, high-contrast, or low-contrast modes; fixing WCAG 2 or APCA contrast; choosing text, border, accent, button-state, or color-blind-safe error, success, warning, and info colors; or turning a brand color or mood words into colors. Outputs CSS variables, Tailwind v4, DTCG tokens, SwiftUI, and Android. Not for chart or data-visualization palettes, print or CMYK color, or editing images.
license: Apache-2.0
compatibility: Requires Node.js 22+
metadata:
  version: "0.3.0"
---

# Chromagentic

Chromagentic is a color engine plus color knowledge for user interfaces. It makes colors from contrast targets, measured the way people see color, so every color has a known contrast in every mode.

**UI colors are not a full value scale.** Start with the few semantic roles the interface needs (text, borders, accent, states, feedback). Add more roles, or a fuller scale, only when the project needs them.

## Running the engine

The engine is one file inside this skill: `scripts/chromagentic.mjs`. It works offline with Node.js 22+ and needs no install. **Run the scripts; don't read them.** `<skill-dir>` is the folder that holds this SKILL.md, such as `.agents/skills/chromagentic`, `.github/skills/chromagentic`, or `.claude/skills/chromagentic` in the project, or the same path under your home folder.

```sh
node <skill-dir>/scripts/chromagentic.mjs generate chromagentic.theme.json --platform web --out src/styles/colors.css --strict
```

In this guide, `chromagentic <command>` means `node <skill-dir>/scripts/chromagentic.mjs <command>`. If the project has the `chromagentic` npm package installed, `npx chromagentic <command>` works too. Add `--json` for machine-readable results. The settings schema and examples are in `<skill-dir>/assets/`; every option is in `references/engine.md`.

## Rules

1. **Use the engine for every color value.** Don't write hex, RGB, or OKLCH values by hand, and don't guess contrast. Generate colors with `chromagentic generate`, and measure any color you didn't generate with `chromagentic contrast`.
2. **Start from roles, not scales.** Declare roles by intent in `chromagentic.theme.json` (`references/semantic-roles.md`). Leave `steps` out unless the project really needs a full scale (`references/scales.md`).
3. **Keep one settings file.** To change colors, edit `chromagentic.theme.json` and generate again. Don't edit the generated output.
4. **Build modes from global settings.** Every mode comes from `backgroundLightness`, `contrastMultiplier`, and `polarityCompensation`. Don't hand-tune colors per mode. When adding a mode to an existing project, put every mode (old and new) in the settings and regenerate them together.
5. **Fit the project's stack and theme switch.** Use the matching `--platform`, `--format`, and selectors (`references/platforms.md`).
6. **Keep the floors** in the roles table below. The engine never goes below them.
7. **Report problems.** `--strict` exits with code 3 when a target can't be reached or feedback colors are too similar for color-blind users. Tell the user and fix the settings. Don't hide warnings.

## Workflow

1. **Find the stack.** Look for `package.json`, Tailwind, token files, `*.swift`, `build.gradle`, existing color files, and how themes switch (`prefers-color-scheme`, a `dark` class, `data-theme`, Tailwind `dark:` variants, asset catalogs, `values-night`).
2. **List the roles the interface needs.** Base this on the information architecture: how much text hierarchy, which interactive elements, and whether there are forms or status messages. Small apps often need only `text`, `text-subtle`, `border`, `accent`, `accent-hover`, and `text-on-accent`.
3. **Choose key colors.** Use the user's brand colors when they exist. For mood words, run `chromagentic suggest "calm and earthy"`, pick from the results, then check the pick with `chromagentic describe <color>` (`references/choosing-colors.md`).
4. **Write `chromagentic.theme.json`.** Key colors, roles, and the modes. New apps get six schemes by default (light and dark, each with regular, high, and low contrast); existing projects keep their current modes unless the user asks for more (`references/themes-and-modes.md`). Add `"status": true` when the app shows errors, validation, or notices (`references/feedback-colors.md`).
5. **Generate** with the matching `--platform` and `--format`, and `--strict`.
6. **Wire it in.** Use role variables in components (`var(--color-text)`), not raw values. Connect the modes to the project's theme switch: the CSS follows system settings and `data-theme="light|dark"` / `data-contrast="more|less|normal"`, so map a `dark` class or Tailwind variant onto those. On Apple and Android, use asset catalog and `values-night` color sets. Roles are measured against the page background; for text on a raised surface or a colored fill, check with `chromagentic contrast` and use the next stronger role if it falls short.
7. **Support forced colors (web).** Keep real borders and focus outlines, and don't use `forced-color-adjust: none` except for color swatches (`references/themes-and-modes.md`, "High contrast mode").
8. **Personal colors: ask first.** For new apps, ask whether people should be able to choose their own lightness and contrast. Only if the user says yes, add `<skill-dir>/scripts/chromagentic-runtime.mjs` (or `chromagentic/runtime` from npm) keep the static schemes as the fallback, and save the choice (`<skill-dir>/assets/personalize-example.html`). Never add it without asking.

## Before you reply

- [ ] The last `chromagentic generate … --strict` run succeeded, and you have read its notes.
- [ ] No hand-written colors are left: search the changed files for `#`, `rgb(`, `hsl(`, and `oklch(` outside the generated file, and replace them with role variables.
- [ ] Text on raised surfaces and colored fills is measured with `chromagentic contrast`.
- [ ] Your reply explains, in plain words, what each role is for, how each mode differs, the contrast targets, and every target the engine moved (from its notes).
- [ ] For a new app, if the user hasn't answered yet, ask this exact question (with an ask-the-user tool if you have one, otherwise as the last line of your reply): "Would you like people to be able to choose their own lightness and contrast (personalized colors)?"

## Roles in brief

Full details are in `references/semantic-roles.md`.

| Role | Target (floor) | Use |
|---|---|---|
| `text-subtle` | ≈4.5:1 (4.5) | Descriptions, metadata, eyebrow headings |
| `text-strong` | ≈7.5:1 (4.5), optional | Default body text when more hierarchy is needed |
| `text` (strongest) | ≈12:1, or the most the mode allows (4.5) | Default text when no extra hierarchy is needed; otherwise titles, headings, calls to action |
| `border` | 3:1 (3) | Input borders, dividers that must be seen, focus rings |
| `accent` | Lightness picked from the brand hue (3) | Fills and marks that need attention: buttons, selected states, focus |
| `text-link` (`{"color": "brand"}`) | (4.5) | Brand-colored text such as links. Never use the 3:1 accent for text |
| `text-on-accent` | (4.5 on the accent) | Label on accent fills: white, black, or the background, whichever passes with the least change |
| states (`-hover`, `-active`, `-selected`, `-focus`) | Small even contrast steps | Interaction states |
| `error`, `success`, `warning`, `info` | (4.5), distinct for color-blind users | Validation, errors, notices |

- **Accent lightness follows the hue.** The engine keeps the accent as close to the brand color as entered as the limits allow: an orange stays light with dark text on it; a deep purple stays deep with white text.
- **Even spacing.** The engine spreads all role and state targets into equal lightness steps. This can raise or lower a target, but never below its floor. It lists each moved target in a note; mention them.
- **Hierarchy follows need.** Don't add `text-strong` or extra states unless the design uses them.

## Converting a mode (light to dark, or dark to light)

The new mode must match the existing one, and the original must keep looking the same.

1. **Read the existing colors.** Find the background, text, subtle text, border, and brand or accent colors, and the variable names components use.
2. **Measure them** with `chromagentic contrast <color> <background>`.
3. **Use them as the system.** Make the original colors key colors (for example a gray scale keyed on the border, subtle text, and text colors, plus the brand). Set `steps` to the measured contrasts with names like `"text": 15.2`, and point roles at them (`"text": "gray.text"`). Set the original mode's `backgroundLightness` to match its background. See the recipe in `references/engine.md`.
4. **Generate both modes together.** The original comes back almost identical, and the new mode gets the same contrast for each role.
5. **Check the original.** Compare generated values with the old ones; if any changed visibly, fix the settings.
6. **Keep the old names** (`--text: var(--color-text)`) and the project's switch (media query, class, or `data-theme`).

## Feedback colors

With `"status": true`, the engine picks error, success, warning, and info hues in harmony with the brand, then adjusts them until every pair stays clearly different (ΔE 2000 ≥ 11) for typical vision and protan, deutan, and tritan color blindness, while keeping the floors. Preview with `chromagentic feedback <brand>`; check any set with `chromagentic check-cvd error=<c> success=<c> …`. Still pair color with an icon or text.

## Settings to choose

Typical values for each mode are in `references/themes-and-modes.md`.

- **Contrast formula:** `wcag2` (default; what laws and audits use) or `apca` (closer to perception, but not part of any standard or current WCAG draft). Use APCA only when asked.
- **Polarity compensation:** extra contrast on dark backgrounds, because light-on-dark looks weaker than its WCAG ratio. Default `0.1`; about `0.15`–`0.25` for text-heavy products or older audiences; `0` only to match an existing design exactly.
- **Contrast multiplier:** `1` normal, about `1.5`–`2` high, about `0.7`–`0.85` low.
- **Background lightness:** about `0.97`–`1` light, `0.12`–`0.2` dark (default `0.15`). Avoid pure black for large surfaces.
- **Gamut:** `--platform` sets it. Wide gamut (OKLCH) for the web; Display P3 for iOS, macOS, and Android; sRGB hex only when the target needs it (email, Flutter, React Native) or the user asks.

## Reference files

Open a file only when the task needs it.

| File | Open it when |
|---|---|
| `references/semantic-roles.md` | Choosing roles, text tiers, accent, states, and spacing |
| `references/engine.md` | Writing settings or using the command-line tool |
| `references/platforms.md` | Finding the stack, theme switch, output format, and gamut |
| `references/themes-and-modes.md` | Light, dark, high- or low-contrast schemes, forced colors, or personalization |
| `references/feedback-colors.md` | Error, success, warning, info colors and color-blind checks |
| `references/contrast.md` | Explaining WCAG 2, APCA, polarity, or contrast problems |
| `references/scales.md` | When a project needs a full value scale |
| `references/choosing-colors.md` | Choosing key colors, harmonies, or colors from mood words |
| `references/accessibility.md` | Color vision deficiency, low vision, or not relying on color alone |
| `references/color-spaces-and-gamut.md` | OKLCH, P3, sRGB, gamut mapping, or interpolation |
| `references/perception.md` | Explaining why colors look different in context |

## Out of scope (for now)

Chromagentic doesn't generate data-visualization palettes or transparent (opacity) colors yet. If asked, explain this, give general guidance from the reference files, and measure any colors you choose with `chromagentic contrast`.

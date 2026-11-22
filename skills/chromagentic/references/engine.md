# Engine

How to write Chromagentic settings and run the engine, with the command-line tool or the JavaScript API.

- Setup
- The settings file
- Roles, surfaces, and optional steps
- Modes
- Generating output
- Warnings and notes
- Measuring, suggesting, and describing colors
- Feedback colors and color-blind checks
- JavaScript API
- Recipes

## Setup

The command-line tool is bundled in this skill at `<skill-dir>/scripts/chromagentic.mjs` (`<skill-dir>` is the folder holding `SKILL.md`). Run it with `node <skill-dir>/scripts/chromagentic.mjs <command>`. It needs Node.js 20 or newer and nothing else, so it works in any project, including Swift and Android ones. Below, `chromagentic <command>` is short for that. If the project has the npm package (`npm install --save-dev chromagentic`), `chromagentic <command>` also works, and the JavaScript API is available.

## The settings file

Keep the settings in `chromagentic.theme.json` at the project root. Only `colors` is required. The full schema and example settings are in `<skill-dir>/assets/`.

```json
{
  "$schema": "https://raw.githubusercontent.com/NateBaldwinDesign/Chromagentic/main/skills/chromagentic/assets/theme.schema.json",
  "colors": {
    "brand": "#ff5a00",
    "slate": ["#f4f6f8", "#5b6672", "#1b2027"]
  },
  "background": { "color": "slate" },
  "roles": {
    "text": {}, "text-subtle": {}, "border": {},
    "accent": { "states": ["hover", "active"] }, "text-on-accent": {}
  },
  "status": true
}
```

| Setting | What it does | Default |
|---|---|---|
| `colors` | Named colors. Each is one key color, a list of key colors, or `{ "keys": [...], "interpolation": "oklch" \| "rgb" }`. Any CSS color works. | Required |
| `background.color` | Color that tints backgrounds and surfaces (the neutral) | The first colorless (gray) color, or a built-in gray |
| `background.lightness` | Background lightness for modes that don't set one (0 black, 1 white) | `1` |
| `roles` | Role name to a role spec (`references/semantic-roles.md`), a fixed `"scale.step"` or `"surface.name"`, or `null` to remove a default | See below |
| `status` | Feedback colors. `true`: harmonized with the brand and checked for color-blind users. An object: your own colors (still checked). `false`: none | Off without `steps`, on with `steps` |
| `spacing` | Even lightness steps between all role and state targets. A number fixes the step (OKLCH L); `false` turns it off | On, step chosen automatically |
| `steps` | Opt-in full value scales. `true` uses the 16 default steps; a list or object sets your own contrasts | Off (roles only) |
| `surfaces` | Layered surfaces, each `{ "contrast", "reference": "parent" \| "base", "color" }` | `raised`, `floating` |
| `modes` | Mode name to global settings | Six schemes (see "Modes") |
| `defaultMode` | Mode used when nothing else applies | The first mode |
| `formula` | `"wcag2"` or `"apca"` | `"wcag2"` |
| `polarityCompensation` | Default polarity compensation for every mode (0–1) | `0.1` |
| `output` | `{ "gamut": "rec2020" \| "display-p3" \| "srgb", "format": "oklch" \| "rgb" \| "hex" \| "hsl" }` | `rec2020`, `oklch` |

Key colors set the hue and chroma. The engine moves along the key colors' path to find the lightness that meets each target, so a key color doesn't need to match any one role. Use two or three key colors (light, middle, dark) when the hue should shift with lightness, for example a yellow that turns olive or brown as it gets darker.

## Roles, surfaces, and optional steps

Without `steps`, the output has only roles and surfaces. Default roles: `text` (strongest tier), `text-subtle`, `border`, and, when there is a brand color, `accent` with `accent-hover` and `accent-active`, plus `text-on-accent`. With `"status": true`, also `error`, `success`, `warning`, `info` and `<name>-background`. Role specs, tiers, floors, states, and spacing are explained in `references/semantic-roles.md`.

The accent comes from the first non-gray color that isn't the background. `text-on-accent` is white, black, or the background, whichever passes 4.5:1 with the least change.

Default surfaces: `background` (the mode's background), `raised` (1.1:1 from its parent), and `floating` (1.6:1 from the base background). Surface contrast is always a WCAG 2 ratio.

**Full scales (opt-in).** `"steps": true` adds 16 steps per color, named `100`–`1600` (WCAG 2 targets 1.06 to 19.5; APCA uses matching Lc values). Roles can then point at steps (`"link": "brand.1000"`), and without `roles` the older fixed-step roles are used. Use full scales only when the project needs many tints (`references/scales.md`).

## Modes

Each mode is three global settings. Every color is recalculated from them.

Default modes (six schemes for new apps):

```json
"modes": {
  "light": { "backgroundLightness": 1 },
  "dark": { "backgroundLightness": 0.08 },
  "light-high-contrast": { "backgroundLightness": 1, "contrastMultiplier": 1.5 },
  "dark-high-contrast": { "backgroundLightness": 0.08, "contrastMultiplier": 1.5 },
  "light-low-contrast": { "backgroundLightness": 1, "contrastMultiplier": 0.8 },
  "dark-low-contrast": { "backgroundLightness": 0.08, "contrastMultiplier": 0.8 }
}
```

Set `modes` yourself to keep an existing project's modes, or to change the values. Low-contrast modes can match regular ones when the floors stop them from going lower.

- `backgroundLightness`: 0 (black) to 1 (white)
- `contrastMultiplier`: 1 is unchanged, above 1 adds contrast, below 1 lowers it (0 to 3)
- `polarityCompensation`: extra contrast on dark backgrounds (WCAG 2 only), 0 to 1
- `media`: the CSS media query that turns the mode on. It's worked out from the name: names with "dark" get `prefers-color-scheme: dark`, and names with "high contrast" or "low contrast" get `prefers-contrast: more` or `less`. Set it yourself, or use `false` for none. The default mode never gets one.

## Generating output

```sh
chromagentic generate chromagentic.theme.json --platform web --out src/styles/colors.css
```

| Option | Meaning |
|---|---|
| `--format css` | CSS custom properties (default) |
| `--format tailwind` | Tailwind v4: the default mode in `@theme`, other modes as overrides |
| `--format dtcg` | Design tokens (DTCG). With `--out`, a folder with one `<mode>.tokens.json` per mode |
| `--format json` | Everything: every color with its CSS string, hex, OKLCH, contrast, and target |
| `--platform <name>` | Sets the gamut and color format for a platform (`references/platforms.md`) |
| `--out <path>` | Write to a file instead of the screen |
| `--strict` | Fail if any color misses its target |

CSS names are `--color-{role}` and `--color-surface-{name}` (plus `--color-{scale}-{step}` when steps are on). The default mode is set on `:root`. Other modes turn on with their media query (`prefers-color-scheme`, `prefers-contrast: more` or `less`), or with attributes on any element:

- `data-theme="dark"` (or any mode name) picks a mode and overrides the system setting.
- `data-contrast="more"` or `"less"` picks the high- or low-contrast version of the current theme; `"normal"` ignores the system contrast setting.

In the JSON output, each color looks like this:

```json
{ "css": "oklch(29.36% 0% 0)", "hex": "#262626", "oklch": [0.2936, 0, 0], "contrast": 12.45, "target": 12.45 }
```

`css` is the exact color in the chosen gamut and format. `hex` is an sRGB fallback. OKLCH chroma in CSS is written as a percentage, where 100% is 0.4.

## Warnings and notes

The engine warns when a target can't be reached, for example 7:1 text on a middle-gray background, and uses the closest color it can. It also warns when feedback colors are too similar for color-blind users, and notes when a high-contrast mode pushes colors to pure black or white. Read each warning to the user and fix the settings: lower the target or multiplier, or move the background closer to white or black. Use `--strict` in CI; it fails on any warning.

A note (not a warning) lists targets that even spacing moved, such as `text-subtle (light 4.5→4.85)`. The JSON output has them under `adjustments`. Mention them when explaining the colors.

## Measuring, suggesting, and describing colors

```sh
chromagentic contrast "#5b6672" "#ffffff"          # 5.85:1
chromagentic contrast "#5b6672" "#ffffff" --formula apca
chromagentic suggest "calm and earthy" --count 6
chromagentic describe "#ff5a00"
```

Use `contrast` for any color the engine didn't make, such as an existing brand color or text on an image. See `references/choosing-colors.md` for `suggest` and `describe`.

## Feedback colors and color-blind checks

```sh
chromagentic feedback "#0d9488"                      # brand-harmonized error, success, warning, info per mode
chromagentic check-cvd error=#d32f2f success=#388e3c # exits with an error if any pair is under ΔE 11
```

See `references/feedback-colors.md`.

## JavaScript API

```js
import { generateTheme, toCss, toDtcg, platformOutput, contrast, feedbackColors, checkCvd } from "chromagentic";

const theme = generateTheme({
  colors: { brand: "#ff5a00" },
  status: true,
  output: platformOutput("web"),
});
theme.warnings;                        // [] when every target is met
theme.adjustments;                     // targets moved by even spacing
theme.modes.dark.roles.text;           // { css, hex, oklch, contrast, target }
theme.modes.dark.feedback;             // color-blind check: { pass, worst, failing, changed }
const css = toCss(theme);              // or toCss(theme, { tailwind: true, prefix: "color" })
const tokens = toDtcg(theme, "light"); // one DTCG document per mode
contrast("#333", "#fff");              // 12.63 (WCAG 2), or contrast(a, b, "apca") for Lc
```

`generateTheme` throws a `ThemeConfigError` with a `problems` list when settings are invalid.

**Personal colors (browser).** Only when the user asks for it:

```js
import { personalize } from "chromagentic/runtime"; // or "<skill-dir>/scripts/chromagentic-runtime.mjs", copied into the app
personalize(settings, { backgroundLightness: 0.15, contrast: 1.3 }); // writes the same --color-* variables on <html>
```

`backgroundLightness` is 0–1 and `contrast` is a multiplier from 0.5 to 2. Floors still hold. Load the generated static CSS too, as the fallback. `<skill-dir>/assets/personalize-example.html` shows saving the choice in `localStorage`.

## Recipes

**Make a brand color accessible.** Use the brand color as the accent's key color and leave the accent's contrast unset. The engine keeps it as close to the brand as the rules allow and picks white or dark text for it. Tell the user how far it moved in each mode (compare `chromagentic describe` of both, or the hex values). Keep the exact brand color for decorative areas without text.

**Button states.** `"accent": { "states": ["hover", "active", "focus"] }` and `"text-on-accent": {}`. Add a `focus-ring` border role if the focus outline sits on the page. For disabled, add `"text-disabled": { "kind": "tint", "contrast": 2 }` with a subtle fill. Don't show state with color alone; keep the label, and add an outline for focus.

**Add a mode.** Add an entry under `modes` and generate again. Don't edit generated colors.

**Convert a hand-made light theme to dark (or dark to light).** Measure each existing color against its background, then use those colors as key colors and those contrasts as named steps, so the original mode comes back almost the same:

```json
{
  "colors": { "gray": ["#d1d5db", "#4b5563", "#111827"], "brand": "#2563eb" },
  "background": { "color": "gray" },
  "steps": { "border": 1.47, "muted": 7.55, "text": 17.73, "accent": 5.16 },
  "roles": { "text": "gray.text", "text-subtle": "gray.muted", "border": "gray.border", "accent": "brand.accent" },
  "modes": { "light": { "backgroundLightness": 1 }, "dark": { "backgroundLightness": 0.12 } }
}
```

Fixed steps aren't moved by even spacing, so the original values stay. Default roles that aren't listed point to the closest named step. Set a role to `null` to drop it.

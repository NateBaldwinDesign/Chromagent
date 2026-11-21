# Engine

How to write Chromagent settings and run the engine, with the command-line tool or the JavaScript API.

- Setup
- The settings file
- Default steps, surfaces, and roles
- Modes
- Generating output
- Warnings
- Measuring, suggesting, and describing colors
- JavaScript API
- Recipes

## Setup

Chromagent needs Node.js 20 or newer. Add it to a JavaScript project with `npm install --save-dev chromagent`. Any project can also run it with `npx chromagent`, including Swift and Android projects.

## The settings file

Keep the settings in `chromagent.theme.json` at the project root. Only `colors` is required.

```json
{
  "$schema": "./node_modules/chromagent/schema/theme.schema.json",
  "colors": {
    "brand": "#ff5a00",
    "slate": ["#f4f6f8", "#5b6672", "#1b2027"]
  },
  "background": { "color": "slate" },
  "modes": {
    "light": { "backgroundLightness": 1 },
    "dark": { "backgroundLightness": 0.1 }
  }
}
```

| Setting | What it does | Default |
|---|---|---|
| `colors` | Named scales. Each is one key color, a list of key colors, or `{ "keys": [...], "interpolation": "oklch" \| "rgb" }`. Any CSS color works. | Required |
| `background.color` | Scale that tints backgrounds and surfaces | The first colorless (gray) scale, or a built-in gray |
| `background.lightness` | Background lightness for modes that don't set one (0 black, 1 white) | `1` |
| `steps` | Contrast target for each step against the background. A list is named `100`, `200`, and so on. An object can use custom names. | 16 steps, `100`–`1600` |
| `surfaces` | Layered surfaces, each `{ "contrast", "reference": "parent" \| "base", "color" }` | `raised`, `floating` |
| `roles` | Role name to `"scale.step"` or `"surface.name"`. `null` removes a default role. | See below |
| `status` | Status role to scale name or CSS color. `false` for none. | success green, warning orange, error red, info blue |
| `modes` | Mode name to global settings | `light` and `dark` |
| `defaultMode` | Mode used when nothing else applies | The first mode |
| `formula` | `"wcag2"` or `"apca"` | `"wcag2"` |
| `polarityCompensation` | Default polarity compensation for every mode (0–1) | `0.1` |
| `output` | `{ "gamut": "rec2020" \| "display-p3" \| "srgb", "format": "oklch" \| "rgb" \| "hex" \| "hsl" }` | `rec2020`, `oklch` |

Key colors set the hue and chroma of a scale. The engine moves along the key colors' path to find the lightness that meets each step's contrast target, so a key color doesn't need to match any one step. Use two or three key colors (light, middle, dark) when a scale should shift hue, for example a yellow that turns olive or brown as it gets darker.

## Default steps, surfaces, and roles

Default WCAG 2 targets. APCA uses matching Lc values (3 to 105.5).

| Step | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000 | 1100 | 1200 | 1300 | 1400 | 1500 | 1600 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Contrast | 1.06 | 1.15 | 1.32 | 1.6 | 2 | 2.6 | 3.22 | 3.95 | 4.79 | 6.29 | 7.9 | 10 | 12.3 | 14.8 | 17 | 19.5 |

- `100`–`300`: subtle fills, hover backgrounds, and status backgrounds
- `400`–`600`: decorative borders and dividers
- `700`–`800`: input borders, icons, and focus rings (3:1 or more)
- `900` and up: text, links, and solid fills behind text (4.5:1 or more)

Default surfaces: `background` (the mode's background), `raised` (1.1:1 from its parent), and `floating` (1.6:1 from the base background). Surface contrast is always a WCAG 2 ratio.

Default roles, using the background scale for neutrals and the first other color for the accent:

| Role | Points to |
|---|---|
| `text`, `text-subtle`, `text-disabled` | Neutral `1400`, `1000`, `600` |
| `border`, `border-strong` | Neutral `400`, `700` |
| `accent`, `accent-hover`, `accent-active` | Accent `900`, `1000`, `1100` |
| `text-on-accent` | `surface.background` |
| `success`, `warning`, `error`, `info` | Status scale `900` |
| `{status}-background`, `{status}-border` | Status scale `100`, `700` |

Status scales are named after their color: `green`, `orange`, `red`, and `blue` by default. A status set to your own CSS color, such as `"status": { "error": "#d93025" }`, makes a scale named `status-error`. So a custom role looks like `"error-strong": "red.1100"`.

Add roles for anything else, such as `"focus-ring": "brand.800"` or `"link": "brand.1000"`. If a role points at something that doesn't exist, the error lists your scale names.

## Modes

Each mode is three global settings. Every color is recalculated from them.

```json
"modes": {
  "light": { "backgroundLightness": 1 },
  "dark": { "backgroundLightness": 0.1 },
  "light-high-contrast": { "backgroundLightness": 1, "contrastMultiplier": 1.5 },
  "dark-high-contrast": { "backgroundLightness": 0, "contrastMultiplier": 1.5 }
}
```

- `backgroundLightness`: 0 (black) to 1 (white)
- `contrastMultiplier`: 1 is unchanged, above 1 adds contrast, below 1 lowers it (0 to 3)
- `polarityCompensation`: extra contrast on dark backgrounds (WCAG 2 only), 0 to 1
- `media`: the CSS media query that turns the mode on. It's worked out from the name: names with "dark" get `prefers-color-scheme: dark`, and names with "high contrast" or "low contrast" get `prefers-contrast: more` or `less`. Set it yourself, or use `false` for none. The default mode never gets one.

## Generating output

```sh
npx chromagent generate chromagent.theme.json --platform web --out src/styles/colors.css
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

CSS names are `--color-{scale}-{step}`, `--color-surface-{name}`, and `--color-{role}`. Roles point to steps with `var()`, so they follow the mode. The default mode is set on `:root`. Other modes turn on with their media query, or with `data-theme="{mode}"` on any element (which overrides the media query).

In the JSON output, each color looks like this:

```json
{ "css": "oklch(29.36% 0% 0)", "hex": "#262626", "oklch": [0.2936, 0, 0], "contrast": 15.08, "target": 14.8, "ref": "gray.1400" }
```

`css` is the exact color in the chosen gamut and format. `hex` is an sRGB fallback. OKLCH chroma in CSS is written as a percentage, where 100% is 0.4.

## Warnings

The engine warns when a target can't be reached, for example 7:1 text on a middle-gray background, and uses the closest color it can. It also notes when a high-contrast mode pushes colors to pure black or white. Read each warning to the user and fix the settings: lower the target or multiplier, or move the background closer to white or black. Use `--strict` in CI.

## Measuring, suggesting, and describing colors

```sh
npx chromagent contrast "#5b6672" "#ffffff"          # 5.85:1
npx chromagent contrast "#5b6672" "#ffffff" --formula apca
npx chromagent suggest "calm and earthy" --count 6
npx chromagent describe "#ff5a00"
```

Use `contrast` for any color the engine didn't make, such as an existing brand color or text on an image. See `references/choosing-colors.md` for `suggest` and `describe`.

## JavaScript API

```js
import { generateTheme, toCss, toDtcg, platformOutput, contrast, suggestColors, describeColor } from "chromagent";

const theme = generateTheme({
  colors: { brand: "#ff5a00" },
  output: platformOutput("web"),
});
theme.warnings;                        // [] when every target is met
theme.modes.dark.roles.text;           // { css, hex, oklch, contrast, target, ref }
const css = toCss(theme);              // or toCss(theme, { tailwind: true, prefix: "color" })
const tokens = toDtcg(theme, "light"); // one DTCG document per mode
contrast("#333", "#fff");              // 12.63 (WCAG 2), or contrast(a, b, "apca") for Lc
```

`generateTheme` throws a `ThemeConfigError` with a `problems` list when settings are invalid.

## Recipes

**Make a brand color accessible.** Use the brand color as a key color. Don't use it directly for text. Use the generated steps: `brand.900` or darker for text and solid buttons with white text, and `brand.700`–`800` for icons and borders. Tell the user which steps sit close to the original brand color.

**Button states.** Use `accent` for the fill, `accent-hover` and `accent-active` for hover and pressed, `text-on-accent` for the label, a `focus-ring` role (step `800` or stronger), and `text-disabled` with a `100`–`200` neutral fill for disabled. Don't show state with color alone; keep the label or add a shape change for focus.

**Add a mode.** Add an entry under `modes` and generate again. Don't edit generated colors.

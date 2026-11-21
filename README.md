# chromagent

Accessible, perception-based UI color for AI coding agents.

Chromagent gives your AI agent two things:

1. **A skill**: practical color knowledge for user interfaces (perception, contrast, scales, modes, accessibility, platforms), rewritten from [Color and Contrast.com](https://colorandcontrast.com).
2. **A color engine**: exact colors made from contrast targets, so your agent never has to guess. Every color has a known contrast in every mode.

Colors are measured the way people see them (OKLCH). Light, dark, high-contrast, and low-contrast modes come from a few global settings, and dark modes get extra contrast to make up for how light text on dark looks weaker (polarity compensation, 10% by default).

## Install

```sh
npx skills add NateBaldwinDesign/Chromagent
```

Other ways to install the same skill:

| Tool | Command |
|---|---|
| GitHub CLI | `gh skill install NateBaldwinDesign/Chromagent chromagent` |
| Claude Code | `/plugin marketplace add NateBaldwinDesign/Chromagent`, then `/plugin install chromagent@chromagent` |
| npm | `npm install --save-dev chromagent`, then `npx skills experimental_sync -y` |

The skill includes its own copy of the engine (`scripts/chromagent.mjs`), so it works offline with just Node.js 20 or newer.

After that, just ask your agent for color work, for example "Create a color system for this app", "Add dark mode", or "Give my app a calm, earthy feel".

## Generate colors yourself

Write a settings file, for example `chromagent.theme.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/NateBaldwinDesign/Chromagent/main/skills/chromagent/assets/theme.schema.json",
  "colors": { "brand": "#0265dc" },
  "modes": {
    "light": { "backgroundLightness": 1 },
    "dark": { "backgroundLightness": 0.1 }
  }
}
```

Then generate:

```sh
npx chromagent generate chromagent.theme.json --out src/colors.css
```

Useful options:

- `--format css|tailwind|dtcg|json`: CSS custom properties (the default), a Tailwind v4 `@theme`, design tokens (DTCG), or all the data.
- `--platform ios|android|web|email|…`: picks the right gamut and format for the platform (see below).
- `--strict`: fail instead of warning when a contrast target can't be reached.

Other commands:

```sh
npx chromagent suggest "calm and earthy"     # candidate key colors for mood words
npx chromagent describe "#c8a03c"            # "rich, golden and warm"
npx chromagent contrast "#767676" "#ffffff"  # 4.54
```

See [`skills/chromagent/assets/`](skills/chromagent/assets) for more settings files, including all four kinds of mode and APCA.

## Settings for each mode

| Setting | What it does | Typical values |
|---|---|---|
| `backgroundLightness` | How light the background is | `1` light, `0.1` dark |
| `contrastMultiplier` | Scales every contrast target | `1` normal, `1.5`–`2` high contrast, `0.7`–`0.85` low contrast |
| `polarityCompensation` | Extra contrast on dark backgrounds (WCAG 2 only) | `0.1` (default) |

Contrast can use **WCAG 2** (the default) or **APCA** (`"formula": "apca"`).

## Platforms and gamut

| Platform | Output |
|---|---|
| Modern web CSS, Tailwind, design tokens | OKLCH, wide gamut |
| iOS, macOS, visionOS, Android Compose | Display P3 |
| Email, Flutter, React Native, older tech | sRGB hex |

## JavaScript API

```js
import { generateTheme, toCss, toDtcg, suggestColors, describeColor, contrast } from "chromagent";

const theme = generateTheme({ colors: { brand: "#0265dc" } });
theme.modes.light.roles.text;   // { css, hex, oklch, contrast, target, ref }
theme.warnings;                 // targets that couldn't be reached, in plain words

const css = toCss(theme);       // CSS custom properties for every mode
const tokens = toDtcg(theme);   // DTCG design tokens

suggestColors("bright vivid").colors; // candidate key colors
describeColor("#c8a03c").summary;     // "rich, golden and warm"
contrast("#767676", "#fff");          // 4.54 (WCAG 2)
```

The words-to-colors data is English and written from a Western point of view. Treat it as a starting point, not a rule.

## Not included yet

Data-visualization palettes and transparent (opacity) colors.

## Development

```sh
npm install
npm test               # unit and property tests
npm run test:coverage  # coverage report (90% goal)
npm run lint && npm run typecheck && npm run build
npm run eval           # agent evals (uses AI credits; see evals/README.md)
```

## License and credits

Apache-2.0. The color engine is adapted from the Spectrum Studio color system (Copyright Adobe, Apache-2.0). Descriptive color features use [color-description](https://github.com/words/color-description) (MIT). See [NOTICE](NOTICE).

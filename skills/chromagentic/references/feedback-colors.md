# Feedback colors

How to choose error, success, warning, and info colors that fit the brand and stay distinct for people with color vision deficiency.

- When to add feedback colors
- Harmony with the brand
- Color vision deficiency check
- Commands and settings
- Tradeoffs
- Using feedback colors well

## When to add feedback colors

Add them when the app has form validation, errors, success confirmations, warnings, or informative messages. Many simple apps need only `error`. Add the others when the design uses them.

Feedback colors usually follow familiar meanings: red for errors, green for success, orange or yellow for warnings, and blue for information. These meanings are common but not universal, so always add an icon or text (see "Using feedback colors well").

## Harmony with the brand

Feedback colors look out of place when they are much more or less vivid than the brand. Chromagentic starts from the brand color:

- **Chroma** (colorfulness) matches the brand, within limits that keep each color recognizable.
- **Hue** is chosen from a harmony with the brand hue (steps of 30° around the color wheel), using the step closest to the middle of each feedback range: error 10°–45° (red), warning 50°–100° (orange to yellow), success 125°–165° (green), and info 225°–265° (blue).
- **Lightness** then comes from each role's contrast target in each mode.

So a teal brand gets a slightly cooler red and green, and an orange brand gets warmer ones, while each still reads as its meaning.

## Color vision deficiency check

About 1 in 12 men and 1 in 200 women have a color vision deficiency. Red and green look alike with protan and deutan deficiency, and blue and green can look alike with tritan deficiency. (Monochromacy is rare and is not part of the check; icons and text cover it.)

For every mode, Chromagentic:

1. Simulates each feedback color as seen with protan, deutan, and tritan deficiency (Machado, Oliveira, and Fernandes 2009, at full strength).
2. Measures the difference between every pair (error vs success, error vs warning, and so on) with CIEDE2000 (ΔE 2000), in normal vision and in each simulation.
3. Requires every difference to be **11 or more**. If a pair is too close, it adjusts lightness first, then hue (staying in its range), then chroma, making the smallest change that works. It never drops a color below its contrast floor.
4. Warns if the target can't be reached (and `--strict` fails), naming the pair, the vision type, and the difference.

Each mode's result is in the JSON output under `feedback`: `pass`, the worst pair, and any colors that changed.

## Commands and settings

```sh
chromagentic feedback "#0d9488"                       # brand-harmonized feedback colors, all six schemes
chromagentic feedback "#0d9488" --formula apca
chromagentic check-cvd error=#d32f2f success=#388e3c warning=#f57c00 info=#1976d2
chromagentic check-cvd error=#d32f2f success=#388e3c --min 11
```

`check-cvd` prints each pair's worst difference and exits with an error when any pair is too close. Use it to check existing feedback colors before converting a theme.

In settings:

- `"status": true` (with no `steps`): brand-harmonized and checked.
- `"status": { "error": "#c62828", "success": "#2e7d32" }`: your own colors, still checked. Leave out the ones you don't need.
- `"status": false`: none.
- With `"steps"` set, `"status": true` keeps the older built-in red, green, orange, and blue scales.

Feedback roles are named `error`, `success`, `warning`, `info`, with tints `<name>-background`. Their scales are named `status-<name>`, so a border role looks like `"error-border": { "kind": "border", "color": "status-error" }`.

API:

```js
import { feedbackColors, checkCvd } from "chromagentic";
const result = feedbackColors("#0d9488");        // { modes: { light: { colors, check }, ... }, warnings }
checkCvd({ error: "#d32f2f", success: "#388e3c" }); // { pass, required: 11, worst, failing }
```

## Tradeoffs

Keeping four colors at ΔE 11 in every simulation and every mode is demanding. The engine often separates them by lightness, so one color (often success or warning) ends up noticeably darker or lighter than the others, especially in high-contrast modes. Light-mode warnings can turn brownish. Tell the user when this happens. If they prefer closer lightness, use fewer feedback colors (for example error and success only), or rely on icons and text for the rest.

## Using feedback colors well

- Never rely on color alone (WCAG 1.4.1). Pair each color with an icon (✕, ✓, ⚠, ℹ) and a clear message.
- Error text next to a field needs 4.5:1; the field's error border needs 3:1.
- Tinted backgrounds (`error-background`) are for panels. Put `text` or the feedback color as text on top, and check the pair with `chromagentic contrast`.
- Keep feedback colors for feedback. Don't reuse red for a brand accent or green for a "go" button unless it really means success.

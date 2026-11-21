# Choosing colors

How to choose a key color and palette, use color harmonies and temperature, and turn descriptive words into colors with the engine.

- Choosing a color
- Choosing a palette
- Color harmonies
- Warm and cool colors
- Color temperature
- Color psychology
- From descriptive words to colors

## Choosing a color

A brand or product color can reinforce its purpose. Choose a color whose emotional qualities fit the brand or the intended feeling of the product.

- Meanings differ across cultures. Check that the color fits the audience.
- The color will likely appear in sRGB and Display P3. Print adds CMYK. Make sure it looks right in each format the brand uses.
- A key color with medium lightness and clear chroma gives the most room to build a scale.

Source: colorandcontrast.com/choosing-a-color/

## Choosing a palette

Start by listing every way the product uses color. These needs decide which extra hues are required.

- Errors usually need a red.
- Success and validation usually need a green.
- Warnings often use orange or yellow. Information often uses blue.
- Charts and categories (taxonomy) may need more hues.
- When using red and green, plan for color vision deficiency. Make them differ in lightness and pair them with icons and text.

Keep chroma consistent across hues. When that is not possible, increase or decrease chroma gradually around the color wheel.

Source: colorandcontrast.com/choosing-a-palette/

## Color harmonies

Harmonies are hue relationships on a color wheel. They help choose secondary and accent colors. The same harmony gives different results in different color spaces. OKLCH hue angles are a good default.

| Harmony | Hue relationship | Character |
|---|---|---|
| Monochromatic | Tints and shades of one hue | Minimal and utilitarian |
| Analogous | Neighboring hues | Simple, elegant, and unified |
| Complementary | Opposite hues (180° apart) | Dynamic, with strong contrast |
| Split-complementary | A hue plus the two neighbors of its complement (an isosceles triangle) | Dynamic, with more variety |
| Triadic | Three hues evenly spaced (an equilateral triangle) | Strong visual impact |
| Tetradic | Four hues on a rectangle or square | Wide range of distinct colors |
| Polygonal | Five or more evenly spaced hues | Many balanced, distinct colors |

Notes:

- "Complementary" means opposite colors. "Complimentary" means free.
- Analogous hues farther apart on the wheel add more interest.
- Analogous hue shifts can improve scales, because they counter the Abney effect.
- Complementary, split-complementary, triadic, tetradic, and polygonal palettes have more risk of color conflicts for people with CVD.
- Split-complementary, triadic, and tetradic schemes come from Johannes Itten's "harmonious chords."
- In UI, one key color plus neutrals is often enough. Use harmonies for a secondary accent, not for every surface.

Source: colorandcontrast.com/complimentary-colors/, colorandcontrast.com/analogous-colors/, colorandcontrast.com/split-complimentary-colors/, colorandcontrast.com/triadic-colors/, colorandcontrast.com/tetradic-colors/, colorandcontrast.com/polygonal-colors/, colorandcontrast.com/monochromatic-colors/

## Warm and cool colors

The color wheel splits into warm and cool halves.

- **Warm**: certain greens, yellow, orange, and red. They can communicate excitement, friendliness, and positivity.
- **Cool**: cyan, blue, purple, and fuchsia. They can communicate calmness, peace, approachability, and sadness.

Complementary colors tend to have opposite temperatures. Using warm and cool together creates dynamic contrast. Some warm and cool pairs are hard to tell apart for people with CVD.

Source: colorandcontrast.com/warm-and-cool-colors/

## Color temperature

A way to describe the appearance of light, measured in degrees Kelvin (K). Lower values look warm (orange), and higher values look cool (blue). It relates to warm and cool colors. A slight warm or cool tint in neutrals changes the mood of a whole interface.

Source: colorandcontrast.com/color-temperature/

## Color psychology

Colors are often linked to descriptive, emotional, or psychological meanings. These links can reinforce a brand and shape the experience for sighted users.

Meanings vary by culture, context, and person. A color that means luck in one place can mean danger or mourning in another. Treat meanings as tendencies, not rules.

Source: colorandcontrast.com/color-psychology/

## From descriptive words to colors

Chromagent can turn mood words into candidate colors and describe colors in words.

### `suggestColors(prompt, { count })`

```js
suggestColors("calm and earthy", { count: 6 })
// {
//   colors: [{ css, hex, oklch: [l, c, h], score, matched: string[], name }],
//   matchedWords: string[],
//   unmatchedWords: string[]
// }
```

It returns candidate key colors whose descriptive words, names, meanings, effects, or usage match the prompt. `score` ranks the match. `matched` lists the words each color matched. If no words are recognized, `colors` is empty. It does not return random colors.

### `describeColor(color)`

```js
describeColor("#e0b830")
// { name, summary, words, nouns, meanings, effects, usage, temperature }
// summary: "rich, golden and warm"
```

It describes a color in plain words. Use it to check a choice and to explain it.

### Workflow

1. **Pull out the mood words.** "A calm, trustworthy bakery app" gives "calm," "trustworthy," and "bakery." Drop words about layout or features.
2. **Call `suggestColors`.** Read `unmatchedWords`. Try synonyms for words that did not match. If `colors` is empty, ask for or pick clearer mood words. Do not invent a color.
3. **Pick one key color.** Choose one brand or accent color from the top results. Add an optional secondary color using a harmony rule (analogous for calm and unified, complementary or split-complementary for energy).
4. **Tint the neutrals.** Neutrals usually get a small amount of the accent hue (very low chroma). This ties the palette together. Warm tints feel cozy. Cool tints feel crisp.
5. **Keep status colors recognizable.** Red, green, orange, and blue must still read as error, success, warning, and info. They can shift slightly toward the palette's hue or temperature. Keep them distinct in lightness.
6. **Verify and explain.** Call `describeColor` on each chosen color. Confirm the words match the request. Explain the choice in plain language. For example: "This muted green reads as calm and natural. The neutrals carry a hint of the same green."
7. **Respect context.** The word data is English and from a Western point of view. Treat it as a starting point, not a rule. Follow the user's culture, audience, and existing brand colors when they differ.

After choosing colors, build scales and themes with the engine, then check contrast. A color that matches the mood still needs to pass contrast in every mode.

# Semantic roles

How to choose the UI colors an interface needs, starting from what each color does, and how Chromagentic turns roles into exact colors.

- Roles first, scales later
- Declaring roles
- Text hierarchy
- Borders and icons
- Brand or accent colors
- Interaction states
- Even spacing
- Feedback colors
- Building out a fuller set
- Examples

## Roles first, scales later

Creating UI colors does not mean creating a full value scale. A scale of 10–16 steps per hue is a tool for large design systems. Most apps need a handful of colors with clear jobs: text, borders, an accent, a few states, and sometimes feedback colors.

Start from those jobs (semantic roles). Add a role only when the design uses it. Build out more steps, or a full scale, when the project needs them, such as a design system shared by many teams, charts, or many tinted surfaces.

When you leave `steps` out of the settings, Chromagentic outputs only the roles (plus surfaces). Each role is solved directly against the background in every mode.

## Declaring roles

Each role is a name plus intent. Every field is optional; the name fills in sensible defaults.

```json
"roles": {
  "text": { "tier": "strongest" },
  "text-subtle": { "min": 4.5 },
  "border": { "min": 3 },
  "accent": { "color": "brand", "states": ["hover", "active", "focus"] },
  "text-on-accent": {}
}
```

| Field | Meaning |
|---|---|
| `kind` | `text`, `icon`, `border`, `accent`, `feedback`, `tint`, or `on`. Guessed from the name: `text-*`, `icon-*`, names with `border`/`outline`/`divider`/`focus-ring`, names with `background`, `*-on-*`, status names, otherwise accent |
| `color` | Scale to draw from. Default: the background (neutral) scale for text and borders, the brand for accents |
| `contrast` | Preferred contrast. Accents pick their own when left out |
| `min` | A minimum. It can raise the kind's floor, never lower it |
| `tier` | Text tier: `subtle`, `strong`, or `strongest`. Guessed from the name |
| `states` | Adds `<role>-hover`, `-active`, `-selected`, `-focus` |

A role can also point at a fixed step or surface (`"gray.1400"`, `"surface.raised"`), and `null` removes a default role.

Defaults when `roles` is left out: `text`, `text-subtle`, `border`, `accent` with `hover` and `active`, and `text-on-accent`. With `"status": true`, also `error`, `success`, `warning`, `info`, and a tinted `<name>-background` for each.

Floors (hard minimums, WCAG 2): text and feedback 4.5:1, icons, borders, and accents 3:1, on-colors 4.5:1 against what they sit on. APCA floors: any text Lc 60, icons, accents, and borders Lc 45. For long body text, use the `strong` tier (Lc 75) or above.

## Text hierarchy

Three tiers. Choose how many based on the information architecture, the app's complexity, and the context.

| Tier | Role | Target | Use |
|---|---|---|---|
| Subtle | `text-subtle` | ≈4.5:1 | Descriptions, metadata, captions, eyebrow headings |
| Strong | `text-strong` | ≈7.5:1 | Optional default body text, when extra hierarchy is needed |
| Strongest | `text` | ≈12:1, or the most the mode allows | Default text when no extra hierarchy is needed; otherwise titles, headings, and calls to action |

- A simple app needs two tiers: `text` and `text-subtle`.
- A dense app (dashboards, documentation, settings with many levels) may need all three. Then body text uses `text-strong`, and `text` is kept for headings and calls to action.
- Don't use lightness alone for hierarchy. Size, weight, and spacing do most of the work.
- In high-contrast modes the tiers move up. In low-contrast modes they move down, but never below 4.5:1.
- Disabled text is exempt from WCAG contrast. If the design needs it, add `"text-disabled": { "kind": "tint", "contrast": 2 }` and pair it with a disabled look (no hover, `cursor: not-allowed`).

## Borders and icons

Borders that people need to see to use a control (input outlines, focus rings, toggles) need 3:1 against the background (WCAG 1.4.11). Purely decorative dividers can be softer: `"divider": { "kind": "tint", "contrast": 1.3 }`, or `"divider": { "ref": "gray.200", "kind": "tint" }` to point to a scale step. A role that points to a step without a `kind` is checked as a border (3:1). Icons that carry meaning also need 3:1 (`icon-*` roles).

## Brand or accent colors

The accent is the brand's primary color. Use it where people need emphasis or attention: buttons, selected states, focus indicators, and active navigation.

The accent only has to reach 3:1, so it is for fills and marks, not text. Brand-colored text, such as links, is text and needs 4.5:1. Add a text role drawn from the brand color: `"text-link": { "color": "brand" }`.

Two rules must both hold in every mode:

1. The accent has at least 3:1 against the background.
2. Text on the accent has at least 4.5:1. That text can be white, black (or the darkest gray), or the page background.

Which lightness works best depends on the hue. Yellow and orange are only recognizable when light, so on a light background they sit near 3:1 with dark text on them. Blue, purple, and red stay recognizable when deep, so they can sit at 5–7:1 with white text. Chromagentic searches for the lightness closest to the brand color as entered that meets both rules, then picks the text-on-accent color that passes with the least change. You don't need to set a contrast for the accent.

If the brand color itself fails both rules (common for mid-tone oranges and greens), the accent moves just far enough. Tell the user how far, and offer the original color for large decorative areas that don't carry text.

## Interaction states

States come from small, even contrast steps away from the background, each a little stronger than the last: `hover`, then `active`, `selected`, and `focus`, in the order listed. Add only the states the design uses.

- Buttons: `accent` with `states: ["hover", "active"]`, plus `text-on-accent`.
- Selected list items or tabs: `"selected"` on the accent, or a tinted background role.
- Focus: a `focus-ring` border role (3:1 minimum) or the accent's `focus` state. Pair focus with a visible outline shape, not just a color change.
- Don't show state with color alone. Keep labels, and add underlines, outlines, or icons.

## Even spacing

When several roles and states each have their own contrast, the result can be lumpy: two colors nearly the same and then a big jump. Chromagentic spreads all the targets of a mode into equal steps of OKLCH lightness (perceptual lightness). The colors then fill in like a consistent scale, with even, perceptible differences between them.

- Spacing can raise or lower a target, but never below its floor.
- Every moved target is listed in a note (for example `text-subtle light 4.5→4.85`). Mention these to the user.
- `"spacing": 0.06` fixes the step size. `"spacing": false` turns it off, for example to match an existing design exactly.

## Feedback colors

`"status": true` adds error, success, warning, and info roles in harmony with the brand, and checks that they stay distinct for color-blind users. See `references/feedback-colors.md`.

## Building out a fuller set

Add roles as needs appear: `link`, `icon`, `focus-ring`, `divider`, `selected-background`, or a second accent. When a project needs many tints of one color (charts, tags, illustrations, a shared design system), turn on full scales with `"steps": true` (or your own list). Roles can then point at steps. See `references/scales.md`.

## Examples

**A small app** (a to-do list or landing page):

```json
{
  "colors": { "brand": "#7c3aed" },
  "roles": {
    "text": {}, "text-subtle": {}, "border": {},
    "accent": { "states": ["hover", "active"] }, "text-on-accent": {}
  }
}
```

**A dense app with forms** (a dashboard):

```json
{
  "colors": { "slate": "#64748b", "brand": "#0d9488" },
  "background": { "color": "slate" },
  "status": true,
  "roles": {
    "text": {}, "text-strong": {}, "text-subtle": {},
    "border": {}, "focus-ring": { "color": "brand" },
    "accent": { "states": ["hover", "active", "selected"] }, "text-on-accent": {},
    "error-border": { "kind": "border", "color": "status-error" }
  }
}
```

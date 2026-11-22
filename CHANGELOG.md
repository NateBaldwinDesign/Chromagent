# Changelog

## 0.3.0
- Renamed from `chromagent` to `chromagentic` (package, command, skill folder, settings file, and GitHub repo). The old repo URL redirects.
- Role-first by default: settings without `steps` produce only semantic roles (text tiers, text-subtle, border, accent with hover/active, text-on-accent), not a full value scale. Use `"steps": true` for the old 16-step scales; string role references like `"gray.1400"` still work.
- Roles are described by intent (`kind`, `tier`, `min`, `contrast`, `states`). Hard minimums: text 4.5:1, borders and accents 3:1, text on an accent 4.5:1.
- Accents pick the lightness closest to the brand color that passes, and text-on-accent picks the background, white, or black, whichever passes with the least change.
- Role and state contrasts are spaced in equal OKLCH lightness steps (`spacing`). Moved targets are listed in `adjustments` and printed by the CLI.
- `status` is off by default for role-first themes; `status: true` adds error, success, warning, and info.
- Six schemes by default: light and dark, each at regular, high (1.5×), and low (0.8×) contrast. CSS follows the system (`prefers-color-scheme`, `prefers-contrast`) and can be set with `data-theme="light|dark"` plus `data-contrast="more|less|normal"`. The exact `data-theme="dark-high-contrast"` style still works.
- Feedback colors that match the brand: `status: true` (role-first) picks error, success, warning, and info hues that harmonize with the brand's hue and chroma, then nudges lightness (then hue, then chroma) until every pair differs by CIEDE2000 ≥ 11 in typical vision and in protan, deutan, and tritan simulations (Machado 2009), without dropping below contrast floors. Each mode reports the check in `feedback`; a failure adds a warning (so `--strict` fails).
- New commands: `chromagentic feedback <brand>` and `chromagentic check-cvd name=color …`. New API: `feedbackColors`, `checkCvd`, `harmonizeFeedback`, `simulateCvd`, `deltaE2000`.

## 0.2.0
- Skills-first release: the engine is bundled in the skill, standard installers, measured evals.

## 0.1.0
- First release.

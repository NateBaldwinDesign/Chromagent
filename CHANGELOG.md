# Changelog

## 0.4.0
Breaking changes are marked **(breaking)**.

**Contrast you can trust**
- `--strict` now fails only on real misses (**warnings**). Expected adjustments, like moved targets, are **notes** and no longer fail it. **(breaking)**
- New warnings when a role or fixed step falls below its floor (text 4.5:1, borders and accents 3:1), including after mapping to sRGB and to hex.
- The default dark background is lighter (OKLCH lightness 0.15), the APCA border floor is 45, and feedback colors stay within lightness ranges where error still reads as red. **(breaking: colors change)**
- Safer input: `media` and the runtime `prefix` are checked, the runtime ignores values that aren't numbers, and the personalization example handles bad saved data.

**A CLI agents can rely on**
- `--json` reports `{ ok, errors, warnings, notes }`. Exit codes: 0 = OK, 2 = bad command or settings, 3 = strict or color-blind check failed. **(breaking)**
- New `validate` command, settings from stdin with `-`, `contrast --json`, and a warning when `--platform` overrides the settings file.
- Unknown settings keys are rejected with a "did you mean" hint, and the schema is tested against the engine. **(breaking)**

**Smaller, easier to audit**
- `color-description` was replaced with a small built-in word table (it's now used only by the evals, as an independent mood grader). The engine uses colorjs.io's tree-shakable API, and unused code was removed.
- The skill scripts are no longer name-mangled, so people and agents can read them (CLI 215 KB, up from 183 KB; runtime 92 KB, down from 101 KB). Each file has a license banner, and culori is credited in NOTICE.
- New `createPersonalizer(config)` prepares the settings once, so live slider changes are fast. The `ThemeIssue` type is exported.

**Skill**
- A sharper description that says when not to use the skill (charts and data visualization, print), a "Before you reply" checklist, a forced-colors step, one source of truth for repeated facts, and corrected facts (APCA status, the Hunt effect, even spacing).

**Evals**
- Results now separate **core outcome** (contrast in every mode, gamut, build, intent) from **skill adherence** (format and roles), so the skill's own style choices no longer inflate the gain. Five runs by default, with 95% confidence intervals.
- Independent graders (color-description for mood, Machado matrices for color blindness), four harder scenarios, a trigger test (should and shouldn't use the skill), full run records (model, versions, skill hash), clean-baseline checks, and replays that re-grade saved runs for free in CI. The 0.3.0 results table was removed until new results are measured.

**Install and release**
- Requires Node.js 22 or newer. **(breaking)**
- Install commands for each agent (Skills CLI, GitHub CLI, Copilot CLI, Claude Code), with update, remove, and pinning. The settings `$schema` URL is pinned to the release.
- Releases are automated: pushing a `v*` tag checks versions, runs every test, publishes to npm with provenance, attests the skill scripts, and creates a GitHub Release from this file. `npm version` keeps every version number in sync.
- CI is hardened (read-only permissions, pinned actions, plugin validation). The Claude Code marketplace maps the old `chromagent` name to `chromagentic`.

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
- Personal colors (opt-in): `chromagentic/runtime` (and `scripts/chromagentic-runtime.mjs` in the skill, 99 KB, 39 KB gzipped) regenerates the same roles live from a person's background lightness and contrast choice and writes CSS variables; the static schemes stay as the fallback. See `assets/personalize-example.html`.
- Skill rewritten around a role-first workflow: UI colors are not a full value scale; text tiers and when to use them, the accent rule, states, even spacing, six schemes and matching the project's theme switch, asking before personalization, and feedback colors. New references: `semantic-roles.md` and `feedback-colors.md`.
- New `text-link` role guidance: links use a text-strength brand color (4.5:1), never the 3:1 accent. If the agent can't stop to ask about personal colors, it ends its reply with the question.
- Evals: four new scenarios (role-first app, form validation with color-blind checks, personal colors, six schemes), low-contrast modes in the grader, and new scores (no full scale, text tiers, CVD separation, harmony with the brand, personalization, theme switch wired, asked).

## 0.2.0
- Skills-first release: the engine is bundled in the skill, standard installers, measured evals.

## 0.1.0
- First release.

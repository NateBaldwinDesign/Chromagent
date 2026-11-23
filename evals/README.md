# Agent evals

These tests check how well a real AI agent uses chromagentic. They start Copilot CLI or Claude Code on small practice projects, then grade what the agent did. **They use AI credits**, so they don't run in CI.

```sh
npm run build
npm run eval                                   # Copilot, every scenario, 5 runs each, with the skill
npm run eval -- --compare                      # with vs. without the skill (the headline numbers)
npm run eval -- --agent claude --scenario dark-mode --runs 3
npm run eval -- --triggers --runs 1            # does the skill load when it should, and only then?
```

| Option | Meaning |
|---|---|
| `--agent copilot\|claude\|all` | Which agent to test. Default `copilot`. |
| `--scenario id[,id]\|all` | Which scenarios to run. Default `all`. |
| `--runs N` | Runs per scenario (or per trigger prompt). Agents vary, so the report needs at least 2 a side for a confidence interval. Default 5. |
| `--parallel N` | Runs at the same time. Default 3. |
| `--baseline` | Run without the skill, to see what the agent does on its own. |
| `--compare` | Run every scenario both with and without the skill, and report the difference. |
| `--triggers` | Run the trigger suite in `triggers.yaml` instead of the scenarios. |
| `--no-rubric` | Skip the AI grader. |
| `--grader copilot\|claude` | Which agent grades with the rubric. Default: the first agent tested. |
| `--model name` | Model for the agent being tested. |
| `--timeout minutes` | Stop a run after this long. Default 15. |
| `--keep` | Keep the temporary workspaces so you can look at them. |

## How a run works

1. A practice project from `fixtures/` is copied to a temporary folder with a neutral name (so the path doesn't hint at what's being tested), and the skill folder is copied into `.agents/skills`, `.github/skills`, and `.claude/skills` (the standard places agents look). In a baseline run, no skill is added.
2. The agent gets the scenario's prompt, exactly as a user would type it.
3. The finished folder and the agent's transcript are graded.

**Keeping the baseline clean.** Agents also load skills from your home folder (`~/.copilot/skills`, `~/.claude/skills`, `~/.agents/skills`). The runner won't start a baseline or trigger run if chromagentic is installed there. A baseline run whose agent still lists or mentions chromagentic is marked and left out of the averages; the report says how many. (The runner doesn't swap out your home folder, because the agents need it to sign in.)

## Scenarios

`scenarios/*.yaml` holds the prompts: a color system, dark mode, high contrast, an accessible brand color, a button with all its states, two mood prompts ("bright vivid", "calm, earthy"), and two mode conversions:

- **light-to-dark**: a hand-made, light-only Tailwind project (`fixtures/light-only`), prompted with "Add a dark mode."
- **dark-to-light**: a dark-only CSS project (`fixtures/dark-only`), prompted with "Add a light mode."

Four cover the role-first approach:

- **role-first**: a new app (`fixtures/new-app`), "Pick the colors for this app."
- **form-validation**: a sign-up form with muted status messages (`fixtures/signup-form`), which needs error, success, warning, and info colors.
- **personalization**: the new app, asked to let people choose their own lightness and contrast.
- **six-schemes**: the new app, "Set up the color themes for this new app."

Four are harder, and test things the skill doesn't spell out step by step:

- **fix-contrast**: fix failing text and keep the look (scored by **Look kept**).
- **aaa-text**: every text color must reach WCAG AAA (7:1 body text, 4.5:1 large text).
- **focus-rings**: add visible focus indicators (scored by **Focus rings**).
- **hex-only**: the user asks for plain hex, so hex is the right format here.

## Scores (with and without the skill)

Every run, with or without the skill, is graded the same way, by code that's separate from the engine. Scores run from 0 to 100% and are split in two groups.

### Core score (the headline)

Outcomes any good answer should reach, whichever way it gets there:

- **Contrast (per mode)**: the share of text, icon, border, and focus-ring pairs that meet their target, measured as an sRGB screen would show them (wide-gamut colors are mapped in first). A required mode that's missing scores 0. For web projects, the pairs come from the page itself (the HTML plus its CSS, Tailwind classes, media queries, and `:focus-visible` outlines). For tokens, Compose, and SwiftUI, they come from role names like `text` on `background`.
- **Colors a screen can show**: the share of new colors inside Display P3. Hex always counts.
- **Mood match**: for mood prompts, the share of key colors described with the requested words (by a word table in `lib/moodWords.ts`, not the engine).
- **Builds**: the project still builds.
- For conversions: **New mode passes**, **Role order kept** (body text strongest, borders subtle), **Perceived contrast kept** (lightness gaps no smaller than the original's, which catches colors that pass the ratio but look flat), **Brand hues kept** (within 15°), **Original unchanged**, and **Mode switch works** (a media query or class).
- **Color-blind safe** (form-validation): status colors differ by CIEDE2000 ΔE ≥ 11 in typical vision and protan, deutan, and tritan simulations (Machado 2009), in every mode.
- **Personal colors** (personalization), **Switch wired** (six-schemes: dark mode uses the app's `data-theme` switch), **Focus rings** (3:1 against what's around them), and **Look kept** (fixed colors keep their hue and don't move far).

### Follows the skill's style

Choices the skill recommends but a good answer might make differently. Shown apart so they don't inflate the headline:

- **Recommended color syntax**: OKLCH for web and tokens, Display P3 for iOS and Android, or whatever the user asked for.
- **Roles, not a full scale**, **Text tiers** (2–4 text colors, the strongest at 7:1), **Feedback matches brand** (status colors about as colorful as the brand), and **Asked about personal colors**.

### Also reported

- **AI grader**: a second agent reads the final reply and checks **accurate** and **explains** against a neutral sheet of standards facts (WCAG, APCA, CVD). The skill's own guide is included only to check claims about the tool. Both conditions are graded the same way.
- **Process** (skill runs only): whether the skill loaded without being named, and the share of new colors that came from the engine.
- **Time and cost**: seconds per run and, for Copilot, premium requests.

The report gives each score's average, its spread between runs (±), the with − without difference, and a **95% interval** for that difference (bootstrap, 4,000 resamples, seeded so it repeats). If the interval includes 0, the difference may be chance.

**Known limit:** colors are found by their role names (text, background, border, and so on). In Android Compose projects, agents working without the skill often hard-code button colors inside the component, where the grader can't see them. Those runs are then scored only on the theme colors it can find.

## Trigger suite

`triggers.yaml` lists prompts that should load the skill (dark mode, contrast fixes, palettes) and prompts that shouldn't (chart colors, CMYK print, photo edits, unrelated web work). `--triggers` runs each one with the skill installed and reports **precision** (when it loaded, it should have) and **recall** (when it should load, it did), plus every miss.

## Replays (free re-grading)

Every run saves `results/<date>/replay/<run>.json`: the files the agent changed, its transcript, and its scores. `lib/replay.ts` grades a replay again with today's code, without starting an agent. `replay/hand-written/` holds a few made-up solutions with the score ranges they must land in (a good hex fix, a poor fix that swaps the brand hue, a focus-ring fix). The unit tests re-grade them, so a grader change that moves scores shows up in CI at no cost. Copy a real replay in, with an `expect` range, to lock in a case you care about.

## Diagnostic checks

Skill runs also get these pass/fail checks, which help explain a low score.

Graded by code:

- **used-engine**: the agent ran the engine (`scripts/chromagentic.mjs generate`, `chromagentic generate`, or `generateTheme`).
- **settings-file**: it saved a working settings file.
- **contrast**: every color meets its target in every mode, or the agent told the user about any warning.
- **engine-colors**: at least 90% of new colors in the project match colors the engine made. This catches hand-written hex codes.
- **format**: colors use the right format for the platform: OKLCH for web and tokens, Display P3 for iOS and Android.
- **modes**: requested modes come from global settings (background lightness, contrast multiplier).
- **descriptive**: for mood words, the agent used `chromagentic suggest`, and at least half of its key colors are described with matching words by `describeColor`.
- **references**: the agent opened the reference file that fits the task.
- **builds**: the project still builds. These checks are lightweight and offline: CSS braces and variables, DTCG JSON and aliases, and a Swift type-check with Xcode. There's no Android build here, so the Compose build is marked as skipped.

Graded by AI (**rubric**): pass when the AI grader marks the reply both accurate and clear.

A skill run passes when every check that applies passes. Skipped checks don't count either way.

## Results

Each batch saves `results/<date>/report.md`, `report.json`, the replays, and the raw transcripts. The report starts with where the numbers came from: the commit (and whether it had uncommitted changes), a fingerprint of the skill folder, the engine version, each agent's version and model, and the grader. It also adds one line to `results/history.jsonl`, so you can compare batches over time and spot drops in quality. Results stay on your machine and aren't committed.

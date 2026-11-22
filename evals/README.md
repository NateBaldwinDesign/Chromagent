# Agent evals

These tests check how well a real AI agent uses chromagentic. They start Copilot CLI or Claude Code on small practice projects, then grade what the agent did. **They use AI credits**, so they don't run in CI.

```sh
npm run build
npm run eval                                   # Copilot, every scenario, 1 run each
npm run eval -- --agent claude --scenario dark-mode --runs 3
npm run eval -- --agent all --no-rubric        # skip the AI grader
npm run eval -- --compare --runs 3             # with vs. without the skill
```

| Option | Meaning |
|---|---|
| `--agent copilot\|claude\|all` | Which agent to test. Default `copilot`. |
| `--scenario id[,id]\|all` | Which scenarios to run. Default `all`. |
| `--runs N` | Runs per scenario. Agents vary, so more runs give steadier pass rates. Default 1. |
| `--parallel N` | Runs at the same time. Default 3. |
| `--baseline` | Run without the skill, to see what the agent does on its own. |
| `--compare` | Run every scenario both with and without the skill, and report the difference. |
| `--no-rubric` | Skip the AI grader. |
| `--grader copilot\|claude` | Which agent grades with the rubric. Default: the first agent tested. |
| `--model name` | Model for the agent being tested. |
| `--timeout minutes` | Stop a run after this long. Default 15. |
| `--keep` | Keep the temporary workspaces so you can look at them. |

## How a run works

1. A practice project from `fixtures/` is copied to a temporary folder, and the skill folder is copied into `.agents/skills`, `.github/skills`, and `.claude/skills` (the standard places agents look). In a baseline run, no skill is added.
2. The agent gets the scenario's prompt, exactly as a user would type it.
3. The finished folder and the agent's transcript are graded.

## Scenarios

`scenarios/*.yaml` holds the prompts: a color system, dark mode, high contrast, an accessible brand color, a button with all its states, two mood prompts ("bright vivid", "calm, earthy"), and two mode conversions:

- **light-to-dark**: a hand-made, light-only Tailwind project (`fixtures/light-only`), prompted with "Add a dark mode."
- **dark-to-light**: a dark-only CSS project (`fixtures/dark-only`), prompted with "Add a light mode."

## Scores (with and without the skill)

Every run, with or without the skill, gets these **result scores** (0–100%). They look at the finished project, not at how the agent got there:

- **Contrast (light / dark / high contrast)**: the share of text, icon, and border color pairs that meet their target in that mode. A required mode that's missing scores 0. For web projects, the pairs come from the page itself (the HTML plus its CSS, Tailwind classes, and media queries). For tokens, Compose, and SwiftUI, they come from role names like `text` on `background`.
- **Platform fit**: the share of new colors that use the right format and gamut for the platform.
- **Mood match**: for mood prompts, the share of key colors that `describeColor` describes with the requested words.
- **Builds**: the project still builds.

The two conversion scenarios add:

- **New mode passes**: every text, icon, and border pair in the new mode meets its target.
- **Role order kept**: roles keep their order of strength (body text strongest, borders subtle).
- **Perceived contrast kept**: the lightness gap of each pair is not smaller than in the original. This catches colors that pass the ratio but look flat.
- **Brand hues kept**: brand and accent hues shift by 15° or less and stay colorful.
- **Original unchanged**: the original mode looks the same (a tiny color difference at most).
- **Mode switch works**: the new mode is switched on by a media query or a class.

**Overall result** is the average of the result scores that apply. Runs with the skill also get two **process scores**: whether the skill was used without being named, and the share of new colors that came from the engine.

The report shows each score's average, how much it varied between runs (±), and the with − without difference.

**Known limit:** colors are found by their role names (text, background, border, and so on). In Android Compose projects, agents working without the skill often hard-code button colors inside the component, where the grader can't see them. Those runs are then scored only on the theme colors it can find, which works in the baseline's favor. The real difference is likely a little larger than reported.

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

Graded by AI (**rubric**): a second agent reads the final reply alongside the skill's reference text, using a fixed scoring guide. It checks whether the reply is accurate and explains the work in plain words.

A skill run passes when every check that applies passes. Skipped checks don't count either way.

## Results

Each run saves `results/<date>/report.md`, `report.json`, and the raw transcripts. It also adds one line to `results/history.jsonl`, so you can compare runs over time and spot drops in quality. Results stay on your machine and aren't committed.

# Agent evals

These tests check how well a real AI agent uses chromagent. They start Copilot CLI or Claude Code on small practice projects, then grade what the agent did. **They use AI credits**, so they don't run in CI.

```sh
npm run build
npm run eval                                   # Copilot, every scenario, 1 run each
npm run eval -- --agent claude --scenario dark-mode --runs 3
npm run eval -- --agent all --no-rubric        # skip the AI grader
```

| Option | Meaning |
|---|---|
| `--agent copilot\|claude\|all` | Which agent to test. Default `copilot`. |
| `--scenario id[,id]\|all` | Which scenarios to run. Default `all`. |
| `--runs N` | Runs per scenario. Agents vary, so more runs give steadier pass rates. Default 1. |
| `--parallel N` | Runs at the same time. Default 3. |
| `--no-rubric` | Skip the AI grader. |
| `--grader copilot\|claude` | Which agent grades with the rubric. Default: the first agent tested. |
| `--model name` | Model for the agent being tested. |
| `--timeout minutes` | Stop a run after this long. Default 15. |
| `--keep` | Keep the temporary workspaces so you can look at them. |

## How a run works

1. The built package is packed and installed once, as a user would get it from npm.
2. A practice project from `fixtures/` is copied to a temporary folder, the package is added, and `chromagent init` installs the skill for the agent being tested.
3. The agent gets the scenario's prompt, exactly as a user would type it.
4. The finished folder and the agent's transcript are graded.

## Checks

Graded by code:

- **used-engine**: the agent ran `chromagent generate` (or called `generateTheme`).
- **settings-file**: it saved a working settings file.
- **contrast**: every color meets its target in every mode, or the agent told the user about any warning.
- **engine-colors**: at least 90% of new colors in the project match colors the engine made. This catches hand-written hex codes.
- **format**: colors use the right format for the platform: OKLCH for web and tokens, Display P3 for iOS and Android.
- **modes**: requested modes come from global settings (background lightness, contrast multiplier).
- **descriptive**: for mood words, the agent used `chromagent suggest`, and at least half of its key colors are described with matching words by `describeColor`.
- **references**: the agent opened the reference file that fits the task.
- **builds**: the project still builds. These checks are lightweight and offline: CSS braces and variables, DTCG JSON and aliases, and a Swift type-check with Xcode. There's no Android build here, so the Compose build is marked as skipped.

Graded by AI (**rubric**): a second agent reads the final reply alongside the skill's reference text, using a fixed scoring guide. It checks whether the reply is accurate and explains the work in plain words.

A run passes when every check that applies passes. Skipped checks don't count either way.

## Results

Each run saves `results/<date>/report.md`, `report.json`, and the raw transcripts. It also adds one line to `results/history.jsonl`, so you can compare runs over time and spot drops in quality. Results stay on your machine and aren't committed.

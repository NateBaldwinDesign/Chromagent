/**
 * Builds `docs/gallery/` from a saved eval report: color swatches made without and with
 * the skill, with pass/fail marks and scores.
 *
 *   npm run gallery -- [results/<date>]   (default: the newest report with both conditions)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import Color from "colorjs.io";
import { projectModes, swatches } from "./lib/outcome";
import { LABELS, type Summary } from "./lib/report";
import { readTextFiles } from "./lib/workspace";
import { loadFixture, loadScenarios } from "./run";
import type { Condition, RunResult, Scenario, SwatchPair } from "./lib/types";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const TILE = { w: 132, h: 64, gap: 12, label: 30, row: 28 };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const shown = (css: string) => new Color(css).toGamut({ space: "srgb" }).to("srgb").toString({ format: "hex", collapse: false });
const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const passes = (p: SwatchPair) => p.ratio >= p.target - 0.005;
const short = (role: string) => role.replace(/^--(color-)?/, "").slice(0, 18);

/** The run whose overall result is the median for this scenario and condition, so the gallery shows a typical run. */
export function pickRun(results: RunResult[], scenario: string, condition: Condition): RunResult | undefined {
  const runs = results.filter((r) => r.scenario === scenario && r.condition === condition && r.swatches).sort((a, b) => (a.metrics.result ?? 0) - (b.metrics.result ?? 0));
  return runs[Math.floor((runs.length - 1) / 2)];
}

/** One color pair per role, failing pairs first, so the most telling ones fit. */
function tidy(list: SwatchPair[], max: number): SwatchPair[] {
  const seen = new Set<string>();
  const shape = (kind: string) => (/border/.test(kind) ? "border" : kind === "icon" ? "icon" : "text");
  const out = [...list].sort((a, b) => a.ratio / a.target - b.ratio / b.target).filter((p) => {
    const k = `${p.role}|${shape(p.kind)}|${p.bg}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  return out.sort((a, b) => Number(passes(a)) - Number(passes(b))).slice(0, max);
}

/** An SVG of color pairs, one row group per mode. Text pairs show "Aa", borders an outline, icons a dot. */
export function swatchSvg(title: string, modes: Record<string, SwatchPair[]>, perRow = 6): string {
  const groups = Object.entries(modes).map(([mode, list]) => [mode, tidy(list, perRow * 3)] as const);
  const width = perRow * (TILE.w + TILE.gap) + TILE.gap;
  const parts: string[] = [];
  let y = 34;
  for (const [mode, list] of groups) {
    parts.push(`<text x="${TILE.gap}" y="${y + 16}" class="mode">${esc(mode)}</text>`);
    y += TILE.row;
    if (!list.length) {
      parts.push(`<text x="${TILE.gap}" y="${y + 18}" class="none">No colors found for this mode</text>`);
      y += TILE.row + 8;
      continue;
    }
    list.forEach((p, i) => {
      const x = TILE.gap + (i % perRow) * (TILE.w + TILE.gap);
      const top = y + Math.floor(i / perRow) * (TILE.h + TILE.label + TILE.gap);
      const [fg, bg] = [shown(p.fg), shown(p.bg)];
      parts.push(`<rect x="${x}" y="${top}" width="${TILE.w}" height="${TILE.h}" rx="8" fill="${bg}" stroke="#0002"/>`);
      if (/border/.test(p.kind)) parts.push(`<rect x="${x + 22}" y="${top + 14}" width="${TILE.w - 44}" height="${TILE.h - 28}" rx="5" fill="none" stroke="${fg}" stroke-width="2"/>`);
      else if (p.kind === "icon") parts.push(`<circle cx="${x + TILE.w / 2}" cy="${top + TILE.h / 2}" r="14" fill="${fg}"/>`);
      else parts.push(`<text x="${x + TILE.w / 2}" y="${top + 41}" text-anchor="middle" class="aa" fill="${fg}">Aa</text>`);
      const mark = passes(p) ? `<tspan class="pass">✓</tspan>` : `<tspan class="fail">✗</tspan>`;
      parts.push(`<text x="${x + 2}" y="${top + TILE.h + 13}" class="role">${esc(short(p.role))}</text>`);
      parts.push(`<text x="${x + 2}" y="${top + TILE.h + 26}" class="ratio">${mark} ${p.ratio.toFixed(2)}:1 (needs ${p.target})</text>`);
    });
    y += Math.ceil(list.length / perRow) * (TILE.h + TILE.label + TILE.gap) + 4;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y + 8}" viewBox="0 0 ${width} ${y + 8}" font-family="system-ui, -apple-system, Segoe UI, sans-serif">
<style>.title{font-size:16px;font-weight:600;fill:#111}.mode{font-size:13px;font-weight:600;fill:#444;text-transform:uppercase;letter-spacing:.05em}.aa{font-size:26px;font-weight:600}.role{font-size:11px;fill:#333}.ratio{font-size:11px;fill:#555}.pass{fill:#137333;font-weight:700}.fail{fill:#c5221f;font-weight:700}.none{font-size:12px;fill:#888;font-style:italic}</style>
<rect width="100%" height="100%" fill="#fff"/>
<text x="${TILE.gap}" y="22" class="title">${esc(title)}</text>
${parts.join("\n")}
</svg>
`;
}

/** The fixture's own colors, before any agent touched it. */
export function originalSwatches(scenario: Scenario): Record<string, SwatchPair[]> {
  const dir = join(ROOT, "evals", "fixtures", scenario.fixture);
  return swatches(projectModes(readTextFiles(dir), loadFixture(scenario.fixture).build));
}

const SCORE_ROWS = ["result", "contrast-light", "contrast-dark", "contrast-high-contrast", "fit", "mood", "build", "new-mode", "role-order", "balance", "hue-kept", "original-kept", "switch"];

function scoreTable(summary: Summary, scenario: string, agent: string): string {
  const cells = summary.byScenario[scenario]?.[agent];
  if (!cells?.baseline || !cells.skill) return "";
  const rows = SCORE_ROWS.filter((k) => cells.baseline.metrics[k] || cells.skill.metrics[k]).map((k) => {
    const [a, b] = [cells.baseline.metrics[k]?.mean, cells.skill.metrics[k]?.mean];
    const diff = a == null || b == null ? "–" : `${b - a >= 0 ? "+" : ""}${Math.round((b - a) * 100)} pts`;
    return `| ${LABELS[k] ?? k} | ${pct(a)} | ${pct(b)} | ${diff} |`;
  });
  return ["| Score | Without skill | With skill | Difference |", "|---|---|---|---|", ...rows].join("\n");
}

/** Writes the SVGs and the gallery page. Returns the page's Markdown. */
export function buildGallery(report: { summary: Summary; results: RunResult[] }, outDir: string, scenarios: Scenario[] = loadScenarios()): string {
  mkdirSync(outDir, { recursive: true });
  const agent = report.results[0]?.agent ?? "copilot";
  const runs = (id: string) => report.summary.byScenario[id]?.[agent];
  const used = scenarios.filter((s) => runs(s.id)?.baseline && runs(s.id)?.skill);
  const write = (name: string, svg: string) => (writeFileSync(join(outDir, name), svg), name);
  const n = runs(used[0]?.id ?? "")?.skill.runs ?? 0;

  const overview = used.map((s) => {
    const c = runs(s.id)!;
    const [a, b] = [c.baseline.metrics.result?.mean ?? 0, c.skill.metrics.result?.mean ?? 0];
    return `| [${s.id}](#${s.id}) | ${pct(a)} | ${pct(b)} | ${b - a >= 0 ? "+" : ""}${Math.round((b - a) * 100)} pts |`;
  });
  const lines = [
    "# Gallery: with and without the skill",
    "",
    `Each scenario was run ${n} time${n === 1 ? "" : "s"} with ${agent}, with and without the chromagent skill, from the same prompt. The swatches show a typical run (the median score). ✓ means the pair meets its contrast target; ✗ means it doesn't. Colors are shown in sRGB so every screen can display them.`,
    "",
    `Report: ${report.summary.date}. Rebuild with \`npm run gallery\`.`,
    "",
    "| Scenario | Without skill | With skill | Difference |",
    "|---|---|---|---|",
    ...overview,
    "",
  ];

  const conversions = used.filter((s) => s.conversion);
  if (conversions.length) lines.push("## Mode conversions", "", "The agent gets a project with only one mode and is asked to add the other. Left to right: the original mode, the new mode without the skill, the new mode with the skill.", "");
  for (const s of conversions) {
    const { from, to } = s.conversion!;
    const pick = (c: Condition) => ({ [to]: pickRun(report.results, s.id, c)?.swatches?.[to] ?? [] });
    lines.push(
      `### ${s.id}`,
      "",
      `> ${s.prompt.trim()}`,
      "",
      `| Original (${from}) | New ${to} mode, without skill | New ${to} mode, with skill |`,
      "|---|---|---|",
      `| ![original](${write(`${s.id}-original.svg`, swatchSvg(`Original ${from} mode`, { [from]: originalSwatches(s)[from] ?? [] }, 3))}) | ![without](${write(`${s.id}-baseline.svg`, swatchSvg("Without skill", pick("baseline"), 3))}) | ![with](${write(`${s.id}-skill.svg`, swatchSvg("With skill", pick("skill"), 3))}) |`,
      "",
      scoreTable(report.summary, s.id, agent),
      "",
    );
  }

  const others = used.filter((s) => !s.conversion);
  if (others.length) lines.push("## New color systems", "");
  for (const s of others) {
    const svg = (c: Condition, label: string) => write(`${s.id}-${c}.svg`, swatchSvg(label, pickRun(report.results, s.id, c)?.swatches ?? {}));
    lines.push(`### ${s.id}`, "", `> ${s.prompt.trim()}`, "", "| Without skill | With skill |", "|---|---|", `| ![without](${svg("baseline", "Without skill")}) | ![with](${svg("skill", "With skill")}) |`, "", scoreTable(report.summary, s.id, agent), "");
  }
  const md = lines.join("\n");
  writeFileSync(join(outDir, "README.md"), md);
  return md;
}

function newestReport(dir: string): string {
  const both = readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, "report.json")))
    .sort()
    .reverse()
    .find((d) => {
      const r = JSON.parse(readFileSync(join(dir, d, "report.json"), "utf8")) as { results: RunResult[] };
      return new Set(r.results.map((x) => x.condition)).size === 2 && new Set(r.results.map((x) => x.scenario)).size > 1;
    });
  if (!both) throw new Error(`No saved report in ${dir} has runs both with and without the skill. Run: npm run eval -- --compare`);
  return join(dir, both);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? newestReport(join(ROOT, "evals", "results"));
  const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8")) as { summary: Summary; results: RunResult[] };
  const out = join(ROOT, "docs", "gallery");
  buildGallery(report, out);
  console.log(`Gallery written to ${relative(process.cwd(), out)}/README.md from ${relative(process.cwd(), dir)}`);
}

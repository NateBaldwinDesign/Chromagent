import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { generateTheme } from "../theme/generateTheme";
import { ThemeConfigError, type ThemeConfig } from "../theme/config";
import { toCss } from "../output/css";
import { toDtcgModes } from "../output/dtcg";
import { platformOutput, PLATFORMS, type Platform } from "../output/platform";
import { describeColor, suggestColors } from "../describe/describe";
import { contrast, type ContrastFormula } from "../math/contrast";

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  version?: string;
}

export const HELP = `chromagentic: accessible, perceptual UI color for AI agents

Usage:
  chromagentic generate <theme.json> [--format css|tailwind|dtcg|json] [--platform <name>] [--out <path>] [--strict]
      Generate colors for every mode from a settings file. Prints to the screen unless --out is given.
      --format    css (default), tailwind (Tailwind v4 @theme), dtcg (design tokens), or json (everything)
      --platform  pick the gamut and format for a platform: ${PLATFORMS.join(", ")}
      --out       file to write; for dtcg, a folder that gets one <mode>.tokens.json per mode
      --strict    fail if any color misses its contrast target

  chromagentic suggest "<words>" [--count 6]     Candidate key colors for words like "calm and earthy"
  chromagentic describe <color>                  Describe a color in plain words
  chromagentic contrast <text> <background> [--formula wcag2|apca]   Measure contrast

  chromagentic --help | --version
`;

class CliError extends Error {}

async function readConfig(path: string): Promise<ThemeConfig> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new CliError(`Can't read the settings file "${path}". Check the path and try again.`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`The settings file "${path}" is not valid JSON: ${(error as Error).message}`);
  }
}

async function generate(args: string[], io: CliIO) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      format: { type: "string", default: "css" },
      platform: { type: "string" },
      out: { type: "string" },
      strict: { type: "boolean", default: false },
    },
  });
  if (positionals.length !== 1) throw new CliError("Give one settings file, for example: chromagentic generate theme.json");
  const format = values.format!;
  if (!["css", "tailwind", "dtcg", "json"].includes(format))
    throw new CliError(`--format must be css, tailwind, dtcg, or json (got "${format}").`);
  const configPath = resolve(io.cwd, positionals[0]);
  const config = await readConfig(configPath);
  if (values.platform) {
    if (!PLATFORMS.includes(values.platform as Platform))
      throw new CliError(`Unknown platform "${values.platform}". Choose one of: ${PLATFORMS.join(", ")}.`);
    const { gamut, format: colorFormat } = platformOutput(values.platform as Platform);
    config.output = { ...config.output, gamut, format: colorFormat };
  }
  const theme = generateTheme(config);
  for (const warning of theme.warnings) io.stderr(`Warning: ${warning}\n`);
  const moved = new Map<string, string[]>();
  for (const a of theme.adjustments) moved.set(a.role, [...(moved.get(a.role) ?? []), `${a.mode} ${a.requested}→${a.used}`]);
  if (moved.size > 0)
    io.stderr(`Note: to keep contrast steps even, these targets moved: ${[...moved].map(([role, list]) => `${role} (${list.join(", ")})`).join("; ")}.\n`);

  const outPath = values.out ? resolve(io.cwd, values.out) : undefined;
  if (format === "dtcg") {
    const documents = toDtcgModes(theme);
    if (outPath) {
      await mkdir(outPath, { recursive: true });
      for (const [mode, document] of Object.entries(documents))
        await writeFile(join(outPath, `${mode}.tokens.json`), `${JSON.stringify(document, null, 2)}\n`);
      io.stderr(`Wrote ${Object.keys(documents).length} token files to ${values.out}\n`);
    } else io.stdout(`${JSON.stringify(documents, null, 2)}\n`);
  } else {
    const text =
      format === "json" ? `${JSON.stringify(theme, null, 2)}\n` : toCss(theme, { tailwind: format === "tailwind" });
    if (outPath) {
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, text);
      io.stderr(`Wrote ${values.out}\n`);
    } else io.stdout(text);
  }
  if (values.strict && theme.warnings.length > 0) {
    io.stderr("Some colors missed their contrast targets (--strict).\n");
    return 1;
  }
  return 0;
}

function suggest(args: string[], io: CliIO) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { count: { type: "string" } } });
  if (positionals.length === 0) throw new CliError('Give some words, for example: chromagentic suggest "calm and earthy"');
  const count = values.count === undefined ? undefined : Number(values.count);
  if (count !== undefined && !(count >= 1)) throw new CliError("--count must be a number of 1 or more.");
  const result = suggestColors(positionals.join(" "), { count });
  io.stdout(`${JSON.stringify(result, null, 2)}\n`);
  if (result.colors.length === 0) io.stderr("No colors matched those words. Try more common descriptive words such as bright, calm, warm, or elegant.\n");
  return 0;
}

function parseColorArgs<T>(fn: () => T) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`That doesn't look like a CSS color. ${(error as Error).message}`);
  }
}

function describeCommand(args: string[], io: CliIO) {
  if (args.length === 0) throw new CliError("Give a color, for example: chromagentic describe #ff5a00");
  io.stdout(`${JSON.stringify(parseColorArgs(() => describeColor(args.join(" "))), null, 2)}\n`);
  return 0;
}

function contrastCommand(args: string[], io: CliIO) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { formula: { type: "string", default: "wcag2" } } });
  if (positionals.length !== 2) throw new CliError("Give two colors, for example: chromagentic contrast #333 #fff");
  const formula = values.formula as ContrastFormula;
  if (formula !== "wcag2" && formula !== "apca") throw new CliError(`--formula must be wcag2 or apca (got "${formula}").`);
  const value = parseColorArgs(() => contrast(positionals[0], positionals[1], formula));
  io.stdout(formula === "apca" ? `Lc ${value.toFixed(1)}\n` : `${(Math.floor(value * 100) / 100).toFixed(2)}:1\n`);
  return 0;
}

/** Runs the command-line tool. Returns the exit code. */
export async function run(argv: string[], io: CliIO): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "generate":
        return await generate(rest, io);
      case "suggest":
        return suggest(rest, io);
      case "describe":
        return describeCommand(rest, io);
      case "contrast":
        return contrastCommand(rest, io);
      case "--version":
      case "-v":
        io.stdout(`${io.version ?? "unknown"}\n`);
        return 0;
      case undefined:
      case "help":
      case "--help":
      case "-h":
        io.stdout(HELP);
        return 0;
      default:
        io.stderr(`Unknown command "${command}".\n\n${HELP}`);
        return 1;
    }
  } catch (error) {
    if (error instanceof ThemeConfigError) io.stderr(`${error.message}\n`);
    else if (error instanceof CliError) io.stderr(`${error.message}\n`);
    else if (error instanceof TypeError && "code" in error && String(error.code).startsWith("ERR_PARSE_ARGS"))
      io.stderr(`${error.message}\nRun "chromagentic --help" for usage.\n`);
    else throw error;
    return 1;
  }
}

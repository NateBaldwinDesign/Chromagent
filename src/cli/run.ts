import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { generateTheme, type Theme, type ThemeIssue } from "../theme/generateTheme";
import { ThemeConfigError, type ThemeConfig } from "../theme/config";
import { toCss } from "../output/css";
import { toDtcgModes } from "../output/dtcg";
import { platformOutput, PLATFORMS, type Platform } from "../output/platform";
import { describeColor, suggestColors } from "../describe/describe";
import { contrast, type ContrastFormula } from "../math/contrast";
import { feedbackColors } from "../theme/feedbackColors";
import { checkCvd, MIN_FEEDBACK_DELTA_E } from "../theme/feedbackHues";

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  version?: string;
  /** Reads all of standard input, for a settings file given as "-". */
  stdin?: () => Promise<string>;
}

/** Exit codes: 0 success, 2 bad input or settings, 3 a check failed (--strict or check-cvd). 1 is left for crashes. */
const EXIT = { ok: 0, input: 2, failed: 3 } as const;

const HELP = `chromagentic: accessible, perceptual UI color for AI agents

Usage:
  chromagentic generate <theme.json | -> [--format css|tailwind|dtcg|json] [--platform <name>] [--out <path>] [--strict]
      Generate colors for every mode from a settings file ("-" reads it from standard input).
      Prints to the screen unless --out is given.
      --format    css (default), tailwind (Tailwind v4 @theme), dtcg (design tokens), or json (everything)
      --platform  pick the gamut and format for a platform: ${PLATFORMS.join(", ")}
      --out       file to write; for dtcg, a folder that gets one <mode>.tokens.json per mode
      --strict    fail if there are any warnings: missed targets or minimums. Notes never fail.

  chromagentic validate <theme.json | -> [--strict]   Check a settings file and list warnings, without printing colors
  chromagentic suggest "<words>" [--count 6]     Candidate key colors for words like "calm and earthy"
  chromagentic describe <color>                  Describe a color in plain words
  chromagentic contrast <text> <background> [--formula wcag2|apca]   Measure contrast
  chromagentic feedback <brand> [--formula wcag2|apca]
      Error, success, warning, and info colors that match the brand, for every default mode,
      checked so each pair stays distinct for color-blind users (protan, deutan, tritan)
  chromagentic check-cvd <name=color>... [--min 11]
      Check that colors stay distinct (CIEDE2000) in typical vision and each color-blind simulation.

  Add --json to any command to get one JSON object on standard output:
      { ok, engineVersion, errors, warnings, notes, output }
  Exit codes: 0 success, 2 bad input or settings, 3 a check failed (--strict or check-cvd).

  chromagentic --help | --version
`;

class CliError extends Error {}

interface Message {
  message: string;
  code?: string;
  mode?: string;
  colors?: string[];
}

/** Collects a command's result. Prints as it goes, or saves everything for one JSON object with --json. */
class Output {
  result: unknown;
  readonly warnings: Message[] = [];
  readonly notes: Message[] = [];
  readonly files: string[] = [];
  failure?: string;

  constructor(
    private readonly io: CliIO,
    readonly json: boolean,
  ) {}

  data(value: unknown, text = `${JSON.stringify(value, null, 2)}\n`) {
    this.result = value;
    if (!this.json) this.io.stdout(text);
  }
  warn(item: Message) {
    this.warnings.push(item);
    if (!this.json) this.io.stderr(`Warning: ${item.message}\n`);
  }
  note(item: Message) {
    this.notes.push(item);
    if (!this.json) this.io.stderr(`Note: ${item.message}\n`);
  }
  wrote(path: string, message: string) {
    this.files.push(path);
    if (!this.json) this.io.stderr(message);
  }
  info(message: string) {
    if (!this.json) this.io.stderr(message);
  }
  fail(message: string) {
    this.failure = message;
    if (!this.json) this.io.stderr(message);
  }
}

const toMessage = ({ code, mode, colors, message }: ThemeIssue): Message => ({ code, mode, colors, message });

async function readConfig(path: string, io: CliIO): Promise<ThemeConfig> {
  let text: string;
  const label = path === "-" ? "standard input" : `"${path}"`;
  try {
    if (path === "-") {
      if (!io.stdin) throw new Error();
      text = await io.stdin();
    } else text = await readFile(resolve(io.cwd, path), "utf8");
  } catch {
    throw new CliError(`Can't read the settings file ${label}. Check the path and try again.`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`The settings file ${label} is not valid JSON: ${(error as Error).message}`);
  }
}

function reportTheme(theme: Theme, out: Output, strict: boolean) {
  for (const issue of theme.issues) (issue.level === "warning" ? out.warn : out.note).call(out, toMessage(issue));
  const moved = new Map<string, string[]>();
  for (const a of theme.adjustments) moved.set(a.role, [...(moved.get(a.role) ?? []), `${a.mode} ${a.requested}→${a.used}`]);
  if (moved.size > 0)
    out.note({
      code: "targets-moved",
      message: `To keep contrast steps even, these targets moved: ${[...moved].map(([role, list]) => `${role} (${list.join(", ")})`).join("; ")}.`,
    });
  if (strict && theme.warnings.length > 0)
    out.fail(`Failed --strict: ${theme.warnings.length} warning${theme.warnings.length === 1 ? "" : "s"} above.\n`);
}

async function generate(args: string[], io: CliIO, out: Output) {
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
  const config = await readConfig(positionals[0], io);
  if (values.platform) {
    if (!PLATFORMS.includes(values.platform as Platform))
      throw new CliError(`Unknown platform "${values.platform}". Choose one of: ${PLATFORMS.join(", ")}.`);
    const { gamut, format: colorFormat } = platformOutput(values.platform as Platform);
    const chosen = { gamut, format: colorFormat };
    const replaced = (["gamut", "format"] as const).filter((key) => config.output?.[key] !== undefined && config.output[key] !== chosen[key]);
    if (replaced.length > 0)
      out.note({
        code: "platform-override",
        message: `--platform ${values.platform} replaces ${replaced.map((key) => `output.${key} "${config.output![key]}"`).join(" and ")} from the settings file with gamut "${gamut}" and format "${colorFormat}".`,
      });
    config.output = { ...config.output, gamut, format: colorFormat };
  }
  const theme = generateTheme(config);
  reportTheme(theme, out, values.strict!);

  const outPath = values.out ? resolve(io.cwd, values.out) : undefined;
  if (format === "dtcg") {
    const documents = toDtcgModes(theme);
    if (outPath) {
      await mkdir(outPath, { recursive: true });
      for (const [mode, document] of Object.entries(documents)) {
        const file = join(outPath, `${mode}.tokens.json`);
        await writeFile(file, `${JSON.stringify(document, null, 2)}\n`);
        out.files.push(file);
      }
      out.info(`Wrote ${Object.keys(documents).length} token files to ${values.out}\n`);
    } else out.data(documents);
  } else {
    const result = format === "json" ? { engineVersion: io.version, ...theme } : toCss(theme, { tailwind: format === "tailwind" });
    const text = typeof result === "string" ? result : `${JSON.stringify(result, null, 2)}\n`;
    if (outPath) {
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, text);
      out.wrote(outPath, `Wrote ${values.out}\n`);
    } else out.data(result, text);
  }
}

async function validate(args: string[], io: CliIO, out: Output) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { strict: { type: "boolean", default: false } } });
  if (positionals.length !== 1) throw new CliError("Give one settings file, for example: chromagentic validate theme.json");
  const theme = generateTheme(await readConfig(positionals[0], io));
  reportTheme(theme, out, values.strict!);
  const modes = Object.keys(theme.modes);
  const roles = Object.keys(theme.modes[theme.defaultMode].roles);
  out.data(
    { modes, roles, warnings: theme.warnings.length },
    `The settings are valid: ${modes.length} mode${modes.length === 1 ? "" : "s"} (${modes.join(", ")}) and ${roles.length} role${roles.length === 1 ? "" : "s"}${theme.warnings.length > 0 ? `, with ${theme.warnings.length} warning${theme.warnings.length === 1 ? "" : "s"}` : ""}.\n`,
  );
}

function suggest(args: string[], out: Output) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { count: { type: "string" } } });
  if (positionals.length === 0) throw new CliError('Give some words, for example: chromagentic suggest "calm and earthy"');
  const count = values.count === undefined ? undefined : Number(values.count);
  if (count !== undefined && !(count >= 1)) throw new CliError("--count must be a number of 1 or more.");
  const result = suggestColors(positionals.join(" "), { count });
  out.data(result);
  if (result.colors.length === 0)
    out.note({ code: "no-match", message: "No colors matched those words. Try more common descriptive words such as bright, calm, warm, or elegant." });
}

function parseColorArgs<T>(fn: () => T) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(`That doesn't look like a CSS color. ${(error as Error).message}`);
  }
}

function describeCommand(args: string[], out: Output) {
  if (args.length === 0) throw new CliError("Give a color, for example: chromagentic describe #ff5a00");
  out.data(parseColorArgs(() => describeColor(args.join(" "))));
}

function parseFormula(value: string | undefined) {
  if (value !== "wcag2" && value !== "apca") throw new CliError(`--formula must be wcag2 or apca (got "${value}").`);
  return value as ContrastFormula;
}

function contrastCommand(args: string[], out: Output) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { formula: { type: "string", default: "wcag2" } } });
  if (positionals.length !== 2) throw new CliError("Give two colors, for example: chromagentic contrast #333 #fff");
  const formula = parseFormula(values.formula);
  const value = parseColorArgs(() => contrast(positionals[0], positionals[1], formula));
  const rounded = formula === "apca" ? Number(value.toFixed(1)) : Math.floor(value * 100) / 100;
  const text = formula === "apca" ? `Lc ${rounded.toFixed(1)}` : `${rounded.toFixed(2)}:1`;
  out.data({ formula, contrast: rounded, text }, `${text}\n`);
}

function feedbackCommand(args: string[], out: Output) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { formula: { type: "string", default: "wcag2" } } });
  if (positionals.length !== 1) throw new CliError("Give one brand color, for example: chromagentic feedback #0066ff");
  const formula = parseFormula(values.formula);
  const result = parseColorArgs(() => feedbackColors(positionals[0], { formula }));
  for (const issue of result.issues) (issue.level === "warning" ? out.warn : out.note).call(out, toMessage(issue));
  out.data(result.modes);
}

function checkCvdCommand(args: string[], out: Output) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { min: { type: "string" } } });
  if (positionals.length < 2) throw new CliError("Give two or more colors, for example: chromagentic check-cvd error=#d32f2f success=#2e7d32");
  const required = values.min === undefined ? MIN_FEEDBACK_DELTA_E : Number(values.min);
  if (!(required > 0)) throw new CliError("--min must be a number above 0.");
  const colors: Record<string, string> = {};
  positionals.forEach((item, index) => {
    const at = item.indexOf("=");
    colors[at > 0 ? item.slice(0, at) : `color${index + 1}`] = at > 0 ? item.slice(at + 1) : item;
  });
  const result = parseColorArgs(() => checkCvd(colors, required));
  out.data(result);
  if (!result.pass) out.fail(`${result.failing.length} pair${result.failing.length === 1 ? " is" : "s are"} too similar (needs a difference of ${required}).\n`);
}

function inputError(error: unknown): string[] | undefined {
  if (error instanceof ThemeConfigError) return [error.message];
  if (error instanceof CliError) return [error.message];
  if (error instanceof TypeError && "code" in error && String(error.code).startsWith("ERR_PARSE_ARGS"))
    return [`${error.message}\nRun "chromagentic --help" for usage.`];
  return undefined;
}

/** Runs the command-line tool. Returns the exit code (see EXIT). */
export async function run(argv: string[], io: CliIO): Promise<number> {
  const json = argv.includes("--json");
  const [command, ...rest] = argv.filter((arg) => arg !== "--json");
  const out = new Output(io, json);
  let errors: string[] = [];
  try {
    switch (command) {
      case "generate":
        await generate(rest, io, out);
        break;
      case "validate":
        await validate(rest, io, out);
        break;
      case "suggest":
        suggest(rest, out);
        break;
      case "describe":
        describeCommand(rest, out);
        break;
      case "contrast":
        contrastCommand(rest, out);
        break;
      case "feedback":
        feedbackCommand(rest, out);
        break;
      case "check-cvd":
        checkCvdCommand(rest, out);
        break;
      case "--version":
      case "-v":
        out.data({ version: io.version ?? "unknown" }, `${io.version ?? "unknown"}\n`);
        break;
      case undefined:
      case "help":
      case "--help":
      case "-h":
        out.data({ help: HELP }, HELP);
        break;
      default:
        throw new CliError(`Unknown command "${command}". Run "chromagentic --help" for the list of commands.`);
    }
  } catch (error) {
    const problems = inputError(error);
    if (!problems) throw error;
    errors = error instanceof ThemeConfigError ? error.problems : problems;
    if (!json) io.stderr(`${problems[0]}\n`);
  }
  const code = errors.length > 0 ? EXIT.input : out.failure ? EXIT.failed : EXIT.ok;
  if (json) {
    const report = {
      ok: code === EXIT.ok,
      engineVersion: io.version ?? "unknown",
      errors: errors.map((message) => ({ message })),
      ...(out.failure && { failed: out.failure.trim() }),
      warnings: out.warnings,
      notes: out.notes,
      ...(out.files.length > 0 && { files: out.files }),
      ...(out.result !== undefined && { output: out.result }),
    };
    io.stdout(`${JSON.stringify(report, null, 2)}\n`);
  }
  return code;
}

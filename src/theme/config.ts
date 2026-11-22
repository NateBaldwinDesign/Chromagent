import Color from "colorjs.io";
import type { ColorFormat, ColorGamut } from "../math/outputSettings";
import type { ContrastFormula } from "../math/contrast";
import type { ColorScaleInterpolation } from "../scales/scaleInterpolation";
import { MAX_CHROMA } from "../math/colorMath";
import { MAX_CONTRAST_MULTIPLIER } from "../modes/polarity";
import { MAX_APCA } from "../math/apca";
import type { ColorStop } from "../engineTypes";
import { expandStates, inferKind, normalizeRoleSpec, pairOf, type NormalizedRole, type RoleKind, type RoleSpec } from "./roles";

/** A key color, a list of key colors, or a scale definition. Colors are any CSS color string. */
export type ColorInput =
  | string
  | string[]
  | { keys: string | string[]; interpolation?: ColorScaleInterpolation };

export type StepInput = number | { contrast: number; opposite?: number };

export interface SurfaceInput {
  /** WCAG 2 contrast against the reference surface (always a WCAG ratio, even with APCA). */
  contrast: number;
  /** Measure against the base background or the previous surface. Default "parent". */
  reference?: "base" | "parent";
  /** Tint the surface with this scale. Default: the background scale. */
  color?: string;
}

export interface ModeInput {
  /** Background lightness from 0 (black) to 1 (white), in OKLCH lightness. */
  backgroundLightness?: number;
  /** Scales every contrast target's distance from 1:1. 1 = unchanged, 2 = high contrast, 0.7 = low contrast. */
  contrastMultiplier?: number;
  /** Extra dark-mode contrast for WCAG 2, from 0 to 1. Default 0.1 (10%). */
  polarityCompensation?: number;
  /** CSS media query that turns this mode on, or false for none. Inferred from the mode name when omitted. */
  media?: string | false;
}

export interface OutputInput {
  gamut?: ColorGamut;
  format?: ColorFormat;
}

export interface ThemeConfig {
  $schema?: string;
  colors: Record<string, ColorInput>;
  background?: { color?: string; lightness?: number };
  /** Full value scales are opt-in: `true` uses the default steps, or list your own contrasts. */
  steps?: true | number[] | Record<string, StepInput>;
  surfaces?: Record<string, SurfaceInput>;
  /**
   * Named UI colors. Each one is a reference like "gray.1400" or "surface.raised",
   * a role spec like { "tier": "subtle" }, or null to remove a default role.
   */
  roles?: Record<string, string | RoleSpec | null>;
  /** Feedback colors (error, success, warning, info). true = built-in colors, or map each name to a color. */
  status?: Record<string, string> | boolean;
  /** Even lightness steps between roles and states. A number fixes the step (OKLCH L); false turns snapping off. */
  spacing?: number | false;
  modes?: Record<string, ModeInput>;
  defaultMode?: string;
  formula?: ContrastFormula;
  polarityCompensation?: number;
  interpolation?: ColorScaleInterpolation;
  output?: OutputInput;
}

export class ThemeConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid theme settings:\n- ${problems.join("\n- ")}`);
    this.name = "ThemeConfigError";
  }
}

/** Spectrum Studio's default WCAG 2 contrast steps, named 100–1600. */
export const DEFAULT_WCAG_STEPS = [
  1.06, 1.15, 1.32, 1.6, 2, 2.6, 3.22, 3.95, 4.79, 6.29, 7.9, 10, 12.3, 14.8, 17, 19.5,
];
/** APCA Lc values that match the WCAG defaults for gray on white. */
export const DEFAULT_APCA_STEPS = [3, 7.5, 15, 27, 39, 51, 60, 67, 73, 82, 88, 93, 98, 102, 104, 105.5];
export const DEFAULT_POLARITY = 0.1;
export const DEFAULT_SURFACES: Record<string, SurfaceInput> = {
  raised: { contrast: 1.1, reference: "parent" },
  floating: { contrast: 1.6, reference: "base" },
};
export const DEFAULT_MODES: Record<string, ModeInput> = {
  light: { backgroundLightness: 1 },
  dark: { backgroundLightness: 0.08 },
};
export const DEFAULT_STATUS: Record<string, string> = {
  success: "green",
  warning: "orange",
  error: "red",
  info: "blue",
};
/** Built-in key colors (Spectrum Studio defaults) used when a status scale is not defined. */
export const BUILT_IN_SCALES: Record<string, [number, number, number][]> = {
  gray: [[0.5692623996686854, 0, 0]],
  red: [[0.675, 30.1, 53.3], [0.5779, 30.4, 51.1], [0.3001, 31.5, 25.5]],
  orange: [[0.7736, 65.1, 43.4], [0.7319, 53, 46.5], [0.49, 42.3, 36.7]],
  green: [[0.7335, 154.2, 44.5], [0.3528, 165.7, 18.4], [0.9011, 156.6, 20]],
  blue: [[0.7893, 258.6, 25.6], [0.5335, 266.7, 59.7], [0.3224, 265.9, 38.9], [0.2409, 268.7, 21.8]],
};
export const BASE_SURFACE = "background";

const NAME = /^[a-z0-9][a-z0-9-]*$/i;
const GAMUTS = ["srgb", "display-p3", "rec2020"];
const FORMATS = ["oklch", "rgb", "hex", "hsl"];

export interface NormalizedScale {
  name: string;
  stops: ColorStop[];
  interpolation: ColorScaleInterpolation;
  builtIn: boolean;
}

export interface NormalizedStep {
  name: string;
  contrast: number;
  opposite?: number;
}

export interface NormalizedMode {
  name: string;
  backgroundLightness: number;
  contrastMultiplier: number;
  polarityCompensation: number;
  media?: string;
}

export interface NormalizedConfig {
  formula: ContrastFormula;
  gamut: ColorGamut;
  format: ColorFormat;
  scales: NormalizedScale[];
  backgroundScale: string;
  steps: NormalizedStep[];
  surfaces: { name: string; contrast: number; reference: "base" | "parent"; color?: string }[];
  roles: Record<string, NormalizedRole>;
  modes: NormalizedMode[];
  defaultMode: string;
  /** True when `steps` was left out: only roles (and steps they reference) are output. */
  roleFirst: boolean;
  /** Step names included in the output scales. */
  outputSteps: string[];
  /** Lightness step for spacing: a fixed number, undefined to search, or false for none. */
  spacing: number | false | undefined;
}

/** Converts a CSS color to a key-color stop (chroma as a percent of 0.4). */
export function keyColorStop(css: string, id: string): ColorStop {
  const [lightness, chroma, hue] = new Color(css).to("oklch").coords.map((value) => Number(value));
  const safeChroma = Number.isFinite(chroma) ? chroma : 0;
  return {
    id,
    lightness: Math.min(1, Math.max(0, lightness)),
    chroma: (safeChroma / MAX_CHROMA) * 100,
    hue: Number.isFinite(hue) && safeChroma > 1e-6 ? hue : 0,
  };
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inRange(problems: string[], label: string, value: unknown, min: number, max: number) {
  if (value === undefined) return;
  if (!isNumber(value) || value < min || value > max) {
    problems.push(`${label} must be a number from ${min} to ${max} (got ${JSON.stringify(value)}).`);
  }
}

function parseKeys(problems: string[], name: string, input: ColorInput, fallback: ColorScaleInterpolation) {
  const keys = typeof input === "string" ? [input] : Array.isArray(input) ? input : input?.keys;
  const list = typeof keys === "string" ? [keys] : keys;
  let interpolation = fallback;
  if (input && typeof input === "object" && !Array.isArray(input) && input.interpolation !== undefined) {
    if (input.interpolation !== "oklch" && input.interpolation !== "rgb") {
      problems.push(`colors.${name}.interpolation must be "oklch" or "rgb".`);
    } else interpolation = input.interpolation;
  }
  if (!Array.isArray(list) || list.length === 0) {
    problems.push(`colors.${name} needs at least one key color, such as "#0066ff".`);
    return undefined;
  }
  const stops: ColorStop[] = [];
  list.forEach((css, index) => {
    try {
      if (typeof css !== "string") throw new Error();
      stops.push(keyColorStop(css, `${name}-${index}`));
    } catch {
      problems.push(`colors.${name}: "${String(css)}" is not a valid CSS color.`);
    }
  });
  return stops.length === list.length ? { stops, interpolation } : undefined;
}

function inferMedia(name: string): string | undefined {
  const words = name.toLowerCase().split(/[-_\s]+/);
  const queries: string[] = [];
  if (words.includes("dark")) queries.push("(prefers-color-scheme: dark)");
  const contrastWord = words.includes("contrast");
  if (contrastWord && words.some((w) => ["high", "more", "increased", "max"].includes(w)))
    queries.push("(prefers-contrast: more)");
  else if (contrastWord && words.some((w) => ["low", "less", "reduced", "min"].includes(w)))
    queries.push("(prefers-contrast: less)");
  return queries.length > 0 ? queries.join(" and ") : undefined;
}

function closestStep(steps: NormalizedStep[], defaults: number[], index: number) {
  const wanted = defaults[index];
  return steps.reduce((best, step) =>
    Math.abs(step.contrast - wanted) < Math.abs(best.contrast - wanted) ? step : best,
  ).name;
}

/** Checks a theme configuration and fills in defaults. Throws ThemeConfigError listing every problem. */
export function normalizeConfig(config: ThemeConfig): NormalizedConfig {
  const problems: string[] = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new ThemeConfigError(["The theme settings must be an object."]);
  }
  const formula = config.formula ?? "wcag2";
  if (formula !== "wcag2" && formula !== "apca") problems.push(`formula must be "wcag2" or "apca".`);
  const gamut = config.output?.gamut ?? "rec2020";
  const format = config.output?.format ?? "oklch";
  if (!GAMUTS.includes(gamut)) problems.push(`output.gamut must be one of ${GAMUTS.join(", ")}.`);
  if (!FORMATS.includes(format)) problems.push(`output.format must be one of ${FORMATS.join(", ")}.`);
  if ((format === "hex" || format === "hsl") && gamut !== "srgb")
    problems.push(`output.format "${format}" only works with output.gamut "srgb". Use "oklch" or "rgb" for wide gamuts.`);
  const interpolation = config.interpolation ?? "oklch";
  if (interpolation !== "oklch" && interpolation !== "rgb") problems.push(`interpolation must be "oklch" or "rgb".`);
  inRange(problems, "polarityCompensation", config.polarityCompensation, 0, 1);

  // Scales
  const scales: NormalizedScale[] = [];
  const colors = config.colors;
  if (!colors || typeof colors !== "object" || Array.isArray(colors) || Object.keys(colors).length === 0) {
    problems.push(`colors needs at least one named color, for example { "brand": "#0066ff" }.`);
  } else {
    for (const [name, input] of Object.entries(colors)) {
      if (!NAME.test(name)) {
        problems.push(`Color name "${name}" can only use letters, numbers, and dashes.`);
        continue;
      }
      const parsed = parseKeys(problems, name, input, interpolation);
      if (parsed) scales.push({ name, ...parsed, builtIn: false });
    }
  }
  const addBuiltIn = (name: string) => {
    scales.push({
      name,
      stops: BUILT_IN_SCALES[name].map(([lightness, hue, chroma], i) => ({ id: `${name}-${i}`, lightness, hue, chroma })),
      interpolation: name === "gray" ? interpolation : "rgb",
      builtIn: true,
    });
  };
  const isNeutral = (scale: NormalizedScale) => scale.stops.every((stop) => stop.chroma < 2);

  // Background
  let backgroundScale = config.background?.color;
  if (backgroundScale !== undefined && !scales.some((s) => s.name === backgroundScale)) {
    problems.push(`background.color "${backgroundScale}" must be the name of one of your colors.`);
  }
  if (backgroundScale === undefined) {
    backgroundScale = scales.find(isNeutral)?.name;
    if (!backgroundScale && scales.length > 0) {
      backgroundScale = "gray";
      if (!scales.some((s) => s.name === "gray")) addBuiltIn("gray");
    }
  }
  inRange(problems, "background.lightness", config.background?.lightness, 0, 1);

  // Status colors
  const statusRoles: Record<string, string> = {};
  const roleFirst = config.steps === undefined;
  const wantStatus = config.status === undefined ? !roleFirst : config.status !== false;
  if (wantStatus) {
    const status = config.status === undefined || config.status === true ? DEFAULT_STATUS : config.status;
    if (typeof status !== "object" || Array.isArray(status)) problems.push("status must be true, false, or an object.");
    else
      for (const [role, value] of Object.entries(status)) {
        if (!NAME.test(role)) {
          problems.push(`Status name "${role}" can only use letters, numbers, and dashes.`);
          continue;
        }
        if (scales.some((s) => s.name === value)) statusRoles[role] = value;
        else if (BUILT_IN_SCALES[value]) {
          addBuiltIn(value);
          statusRoles[role] = value;
        } else {
          const parsed = parseKeys(problems, role, value, interpolation);
          if (parsed) {
            const scaleName = `status-${role}`;
            if (scales.some((s) => s.name === scaleName))
              problems.push(`status.${role} conflicts with a color named "${scaleName}".`);
            else {
              scales.push({ name: scaleName, ...parsed, builtIn: false });
              statusRoles[role] = scaleName;
            }
          }
        }
      }
  }

  // Steps
  const stepDefaults = formula === "apca" ? DEFAULT_APCA_STEPS : DEFAULT_WCAG_STEPS;
  const maxContrast = formula === "apca" ? MAX_APCA : 21;
  const minContrast = formula === "apca" ? 0 : 1;
  const rawSteps: [string, StepInput][] = Array.isArray(config.steps)
    ? config.steps.map((value, i) => [String((i + 1) * 100), value])
    : config.steps && typeof config.steps === "object"
      ? Object.entries(config.steps)
      : stepDefaults.map((value, i) => [String((i + 1) * 100), value]);
  if (config.steps !== undefined && config.steps !== true && (typeof config.steps !== "object" || config.steps === null))
    problems.push("steps must be true (the default full scale), a list of contrasts, or named steps.");
  else if (config.steps !== undefined && rawSteps.length === 0) problems.push("steps needs at least one contrast value.");
  const steps: NormalizedStep[] = [];
  for (const [name, input] of rawSteps) {
    const contrast = typeof input === "object" && input !== null ? input.contrast : input;
    const opposite = typeof input === "object" && input !== null ? input.opposite : undefined;
    if (!NAME.test(name)) problems.push(`Step name "${name}" can only use letters, numbers, and dashes.`);
    if (!isNumber(contrast) || contrast < minContrast || contrast > maxContrast) {
      problems.push(`steps.${name} must be a contrast from ${minContrast} to ${maxContrast} for ${formula} (got ${JSON.stringify(contrast)}).`);
      continue;
    }
    if (opposite !== undefined) {
      if (formula === "apca") problems.push(`steps.${name}.opposite only applies to the wcag2 formula.`);
      inRange(problems, `steps.${name}.opposite`, opposite, 1, 21);
    }
    steps.push({ name, contrast, ...(opposite !== undefined && { opposite }) });
  }

  // Surfaces
  const surfaceInput = config.surfaces ?? DEFAULT_SURFACES;
  const surfaces: NormalizedConfig["surfaces"] = [];
  for (const [name, input] of Object.entries(surfaceInput)) {
    if (!NAME.test(name)) problems.push(`Surface name "${name}" can only use letters, numbers, and dashes.`);
    if (name === BASE_SURFACE) {
      problems.push(`"${BASE_SURFACE}" is the base surface and is always included; pick another surface name.`);
      continue;
    }
    if (!input || typeof input !== "object") {
      problems.push(`surfaces.${name} must be an object like { "contrast": 1.1 }.`);
      continue;
    }
    inRange(problems, `surfaces.${name}.contrast`, input.contrast, 1, 21);
    if (input.contrast === undefined) problems.push(`surfaces.${name}.contrast is required.`);
    if (input.reference !== undefined && input.reference !== "base" && input.reference !== "parent")
      problems.push(`surfaces.${name}.reference must be "base" or "parent".`);
    if (input.color !== undefined && !scales.some((s) => s.name === input.color))
      problems.push(`surfaces.${name}.color "${input.color}" must be the name of one of your colors.`);
    surfaces.push({ name, contrast: input.contrast, reference: input.reference ?? "parent", color: input.color });
  }

  // Modes
  const modeInput = config.modes ?? DEFAULT_MODES;
  const modes: NormalizedMode[] = [];
  if (typeof modeInput !== "object" || Object.keys(modeInput).length === 0) problems.push("modes needs at least one mode.");
  const defaultMode = config.defaultMode ?? Object.keys(modeInput)[0];
  if (config.defaultMode !== undefined && !(config.defaultMode in modeInput))
    problems.push(`defaultMode "${config.defaultMode}" is not one of your modes.`);
  for (const [name, mode] of Object.entries(modeInput)) {
    if (!NAME.test(name)) problems.push(`Mode name "${name}" can only use letters, numbers, and dashes.`);
    const m = mode ?? {};
    inRange(problems, `modes.${name}.backgroundLightness`, m.backgroundLightness, 0, 1);
    inRange(problems, `modes.${name}.contrastMultiplier`, m.contrastMultiplier, 0, MAX_CONTRAST_MULTIPLIER);
    inRange(problems, `modes.${name}.polarityCompensation`, m.polarityCompensation, 0, 1);
    if (m.media !== undefined && m.media !== false && typeof m.media !== "string")
      problems.push(`modes.${name}.media must be a CSS media query string or false.`);
    const media = name === defaultMode ? undefined : m.media === false ? undefined : (m.media ?? inferMedia(name));
    modes.push({
      name,
      backgroundLightness: m.backgroundLightness ?? config.background?.lightness ?? 1,
      contrastMultiplier: m.contrastMultiplier ?? 1,
      polarityCompensation: m.polarityCompensation ?? config.polarityCompensation ?? DEFAULT_POLARITY,
      ...(media && { media }),
    });
  }

  // Roles
  const neutral = backgroundScale;
  const statusScales = new Set(Object.values(statusRoles));
  const accentScale = (
    scales.find((s) => !s.builtIn && !isNeutral(s) && !statusScales.has(s.name) && s.name !== neutral) ??
    scales.find((s) => !s.builtIn && !isNeutral(s) && !statusScales.has(s.name)) ??
    scales.find((s) => !s.builtIn && !isNeutral(s))
  )?.name;
  const defaults: Record<string, string | RoleSpec> = {};
  if (roleFirst) {
    Object.assign(defaults, { text: {}, "text-subtle": {}, border: {} });
    if (accentScale) Object.assign(defaults, { accent: { color: accentScale, states: ["hover", "active"] }, "text-on-accent": {} });
    for (const [role, scale] of Object.entries(statusRoles)) {
      defaults[role] = { kind: "feedback", color: scale };
      defaults[`${role}-background`] = { kind: "tint", color: scale };
    }
  } else if (steps.length > 0 && neutral) {
    const at = (index: number) => closestStep(steps, stepDefaults, index);
    Object.assign(defaults, {
      text: `${neutral}.${at(13)}`,
      "text-subtle": `${neutral}.${at(9)}`,
      "text-disabled": `${neutral}.${at(5)}`,
      border: `${neutral}.${at(3)}`,
      "border-strong": `${neutral}.${at(6)}`,
    });
    if (accentScale)
      Object.assign(defaults, {
        accent: `${accentScale}.${at(8)}`,
        "accent-hover": `${accentScale}.${at(9)}`,
        "accent-active": `${accentScale}.${at(10)}`,
        "text-on-accent": `surface.${BASE_SURFACE}`,
      });
    for (const [role, scale] of Object.entries(statusRoles)) {
      defaults[role] = `${scale}.${at(8)}`;
      defaults[`${role}-background`] = `${scale}.${at(0)}`;
      defaults[`${role}-border`] = `${scale}.${at(6)}`;
    }
  }
  const merged: Record<string, string | RoleSpec> = { ...defaults };
  const userRoles = config.roles ?? {};
  if (typeof userRoles !== "object" || Array.isArray(userRoles)) problems.push("roles must be an object.");
  else
    for (const [role, value] of Object.entries(userRoles)) {
      if (!NAME.test(role)) problems.push(`Role name "${role}" can only use letters, numbers, and dashes.`);
      if (value === null) delete merged[role];
      else merged[role] = value;
    }
  // A default on-color goes away with the role it sits on.
  for (const role of Object.keys(merged)) {
    const pair = pairOf(role);
    if (typeof merged[role] !== "object" || role in userRoles || !pair) continue;
    if (!(pair in merged)) delete merged[role];
    // A fixed-step pair keeps the older default: the page background.
    else if (typeof merged[pair] === "string") merged[role] = `surface.${BASE_SURFACE}`;
  }
  const scaleNames = new Set(scales.map((s) => s.name));
  const stepNames = new Set(steps.map((s) => s.name));
  const surfaceNames = new Set([BASE_SURFACE, ...surfaces.map((s) => s.name)]);
  const available = `Your scales are: ${scales.map((s) => s.name).join(", ") || "none"}.`;
  const defaultScale = (kind: RoleKind) => (kind === "accent" ? (accentScale ?? neutral) : kind === "feedback" ? undefined : neutral);
  const normalized: Record<string, NormalizedRole> = {};
  const specs: Record<string, RoleSpec | undefined> = {};
  const referencedSteps = new Set<string>();
  for (const [role, value] of Object.entries(merged)) {
    if (typeof value === "string") {
      const [group, item, extra] = value.split(".");
      const valid =
        extra === undefined &&
        (group === "surface" ? surfaceNames.has(item) : scaleNames.has(group) && stepNames.has(item));
      if (!valid)
        problems.push(`roles.${role} "${value}" must point to a color step like "${neutral ?? "gray"}.${steps.at(-3)?.name ?? "1400"}" or a surface like "surface.${BASE_SURFACE}". ${available}`);
      else if (group !== "surface") referencedSteps.add(item);
      normalized[role] = { name: role, kind: inferKind(role), ref: value, floor: 0 };
    } else {
      const result = normalizeRoleSpec(problems, role, value, formula, scaleNames, defaultScale);
      if (result) {
        normalized[role] = result;
        specs[role] = value;
      }
    }
  }
  const roles = expandStates(normalized, specs);
  for (const role of Object.values(roles))
    if (role.pair && (!roles[role.pair] || roles[role.pair].kind === "on" || roles[role.pair].ref))
      problems.push(`roles.${role.name} sits on "${role.pair}", which must be a generated role (not a reference or another on-color).`);
  if (config.spacing !== undefined && config.spacing !== false && (!isNumber(config.spacing) || config.spacing < 0.01 || config.spacing > 0.2))
    problems.push("spacing must be false or a lightness step from 0.01 to 0.2.");

  // Names must not collide in the output.
  const used = new Map<string, string>();
  const claim = (key: string, owner: string) => {
    const previous = used.get(key);
    if (previous) problems.push(`The name "${key}" is used by both ${previous} and ${owner}; rename one of them.`);
    else used.set(key, owner);
  };
  claim("surface", "the surface group");
  scales.forEach((s) => claim(s.name, `color "${s.name}"`));
  Object.keys(roles).forEach((role) => claim(role, `role "${role}"`));

  if (problems.length > 0) throw new ThemeConfigError(problems);
  return {
    formula,
    gamut,
    format,
    scales,
    backgroundScale: backgroundScale!,
    steps,
    surfaces,
    roles,
    modes,
    defaultMode,
    roleFirst,
    outputSteps: roleFirst ? steps.map((s) => s.name).filter((name) => referencedSteps.has(name)) : steps.map((s) => s.name),
    spacing: config.spacing,
  };
}

import type { ContrastFormula } from "../math/contrast";

/** What a role is used for. It sets the role's minimum contrast. */
export type RoleKind = "text" | "icon" | "border" | "accent" | "feedback" | "tint" | "on";
/** Text hierarchy: subtle (≈4.5:1), strong (≈7.5:1), strongest (≈12:1 or the most the mode allows). */
export type RoleTier = "subtle" | "strong" | "strongest";
/** Interaction states. Each one steps a little further from the background than the one before. */
export type RoleState = "hover" | "active" | "selected" | "focus";

/** A role described by intent. Every field is optional; the name fills in sensible defaults. */
export interface RoleSpec {
  /** What the role is for. Inferred from the name: text-*, icon-*, *border*, *background*, *-on-*, status names, otherwise accent. */
  kind?: RoleKind;
  /** The color (scale) name to draw from. Default: the neutral for text and borders, the brand color for accents. */
  color?: string;
  /** Preferred contrast against the background. Accents pick their own lightness when omitted. */
  contrast?: number;
  /** Minimum contrast. It can raise the kind's floor but never lower it. */
  min?: number;
  /** Text tier. Inferred from the name (text = strongest, text-strong, text-subtle). */
  tier?: RoleTier;
  /** Extra roles named `<role>-<state>`, each a small even step more contrast than the last. */
  states?: RoleState[];
}

export const ROLE_KINDS: RoleKind[] = ["text", "icon", "border", "accent", "feedback", "tint", "on"];
export const ROLE_TIERS: RoleTier[] = ["subtle", "strong", "strongest"];
export const ROLE_STATES: RoleState[] = ["hover", "active", "selected", "focus"];
export const FEEDBACK_NAMES = ["error", "success", "warning", "info"];

/** Hard minimums per kind. WCAG 2: text 4.5:1, non-text 3:1. APCA: any text Lc 60, non-text (icons, accents, component edges) Lc 45. */
export const ROLE_FLOORS: Record<ContrastFormula, Record<RoleKind, number>> = {
  wcag2: { text: 4.5, icon: 3, border: 3, accent: 3, feedback: 4.5, tint: 1, on: 4.5 },
  apca: { text: 60, icon: 45, border: 45, accent: 45, feedback: 60, tint: 0, on: 60 },
};
const TIER_CONTRAST: Record<ContrastFormula, Record<RoleTier, number>> = {
  wcag2: { subtle: 4.5, strong: 7.5, strongest: 12 },
  apca: { subtle: 60, strong: 75, strongest: 90 },
};
/** Default contrast for tinted backgrounds (such as error-background). */
const TINT_CONTRAST: Record<ContrastFormula, number> = { wcag2: 1.15, apca: 7.5 };

export interface NormalizedRole {
  name: string;
  kind: RoleKind;
  /** Set for roles that point at a scale step or surface, such as "gray.1400". */
  ref?: string;
  /** Scale the role is generated from. */
  scale?: string;
  /** Preferred contrast before mode settings. Undefined for accents, which choose their own. */
  contrast?: number;
  /** Hard minimum contrast. */
  floor: number;
  tier?: RoleTier;
  /** For state roles: the role it steps from and its position (1 = first state). */
  base?: string;
  step?: number;
  /** For on-colors: the role they sit on. */
  pair?: string;
}

/** Guesses a role's kind from its name. */
export function inferKind(name: string): RoleKind {
  const lower = name.toLowerCase();
  if (/(^|-)on-/.test(lower)) return "on";
  if (/^text(-|$)/.test(lower)) return "text";
  if (/^icon(-|$)/.test(lower)) return "icon";
  if (/(border|outline|divider|focus-ring)/.test(lower)) return "border";
  if (/(background|tint|-bg$)/.test(lower)) return "tint";
  if (FEEDBACK_NAMES.includes(lower)) return "feedback";
  return "accent";
}

/** Guesses a text tier from the role name. */
export function inferTier(name: string): RoleTier | undefined {
  if (name === "text" || name.endsWith("-strongest")) return "strongest";
  if (name.endsWith("-strong")) return "strong";
  if (name.endsWith("-subtle")) return "subtle";
  return undefined;
}

/** The role an on-color sits on: "text-on-accent" → "accent". */
export function pairOf(name: string) {
  const match = /(?:^|-)on-(.+)$/.exec(name);
  return match?.[1];
}

/**
 * Turns a role spec into a normalized role (without states). Problems are pushed onto `problems`.
 * `defaultScale` picks the scale when `color` is omitted.
 */
export function normalizeRoleSpec(
  problems: string[],
  name: string,
  spec: RoleSpec,
  formula: ContrastFormula,
  scaleNames: Set<string>,
  defaultScale: (kind: RoleKind) => string | undefined,
): NormalizedRole | undefined {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    problems.push(`roles.${name} must be a color reference like "gray.1400", an object like { "tier": "subtle" }, or null.`);
    return undefined;
  }
  const max = formula === "apca" ? 108 : 21;
  const kind = spec.kind ?? inferKind(name);
  if (!ROLE_KINDS.includes(kind)) {
    problems.push(`roles.${name}.kind must be one of ${ROLE_KINDS.join(", ")}.`);
    return undefined;
  }
  if (spec.tier !== undefined && !ROLE_TIERS.includes(spec.tier))
    problems.push(`roles.${name}.tier must be one of ${ROLE_TIERS.join(", ")}.`);
  for (const key of ["contrast", "min"] as const) {
    const value = spec[key];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max))
      problems.push(`roles.${name}.${key} must be a contrast from 0 to ${max} for ${formula}.`);
  }
  if (spec.states !== undefined) {
    if (!Array.isArray(spec.states) || spec.states.some((s) => !ROLE_STATES.includes(s)))
      problems.push(`roles.${name}.states must be a list using ${ROLE_STATES.join(", ")}.`);
    else if (kind === "on" || kind === "tint") problems.push(`roles.${name} is a ${kind} role and can't have states.`);
  }
  const scale = spec.color ?? defaultScale(kind);
  if (kind !== "on") {
    if (spec.color !== undefined && !scaleNames.has(spec.color))
      problems.push(`roles.${name}.color "${spec.color}" must be the name of one of your colors.`);
    else if (!scale && scaleNames.size > 0) problems.push(`roles.${name} needs a color, for example { "color": "brand" }.`);
  }
  const floor = Math.max(ROLE_FLOORS[formula][kind], spec.min ?? 0);
  const tier = kind === "text" ? (spec.tier ?? inferTier(name) ?? "subtle") : spec.tier;
  let contrast = spec.contrast;
  if (contrast === undefined && tier) contrast = TIER_CONTRAST[formula][tier];
  if (contrast === undefined && kind === "tint") contrast = TINT_CONTRAST[formula];
  if (contrast === undefined && kind !== "accent" && kind !== "on") contrast = floor;
  const pair = kind === "on" ? pairOf(name) : undefined;
  if (kind === "on" && !pair) problems.push(`roles.${name} is an on-color, so its name needs to say what it sits on, like "text-on-accent".`);
  return {
    name,
    kind,
    ...(kind !== "on" && scale && { scale }),
    ...(contrast !== undefined && { contrast: Math.max(contrast, kind === "tint" ? 0 : floor) }),
    floor,
    ...(tier && { tier }),
    ...(pair && { pair }),
  };
}

/** Adds `<role>-<state>` roles after each role that lists states. Explicit roles with the same name win. */
export function expandStates(roles: Record<string, NormalizedRole>, specs: Record<string, RoleSpec | undefined>) {
  const result: Record<string, NormalizedRole> = {};
  for (const [name, role] of Object.entries(roles)) {
    result[name] = role;
    (specs[name]?.states ?? []).forEach((state, index) => {
      const stateName = `${name}-${state}`;
      if (roles[stateName]) return;
      const added: NormalizedRole = { ...role, name: stateName, base: name, step: index + 1 };
      delete added.tier;
      result[stateName] = added;
    });
  }
  return result;
}

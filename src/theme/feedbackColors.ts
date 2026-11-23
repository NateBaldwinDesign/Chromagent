import { generateTheme, type ColorValue, type ThemeIssue } from "./generateTheme";
import type { ThemeConfig } from "./config";
import type { CvdReport } from "./feedbackHues";
import { FEEDBACK_NAMES } from "./roles";

export interface FeedbackColors {
  /** Per mode: error, success, warning, and info colors, plus their color-vision check. */
  modes: Record<string, { colors: Record<string, ColorValue>; check?: CvdReport & { changed: string[] } }>;
  warnings: string[];
  /** The same warnings with a code, mode, and the colors involved. */
  issues: ThemeIssue[];
}

/**
 * Error, success, warning, and info colors that harmonize with a brand color, meet text contrast
 * in every mode, and stay distinct (CIEDE2000 ≥ 11) for protan, deutan, and tritan color vision.
 */
export function feedbackColors(
  brand: string,
  options: Pick<ThemeConfig, "modes" | "formula" | "output" | "polarityCompensation"> = {},
): FeedbackColors {
  const theme = generateTheme({ ...options, colors: { brand }, status: true, roles: { accent: null } });
  const modes: FeedbackColors["modes"] = {};
  for (const [name, mode] of Object.entries(theme.modes)) {
    const colors: Record<string, ColorValue> = {};
    for (const role of FEEDBACK_NAMES) {
      const { css, hex, oklch, contrast, target, capped } = mode.roles[role];
      colors[role] = { css, hex, oklch, contrast, target, ...(capped && { capped }) };
    }
    modes[name] = { colors, ...(mode.feedback && { check: mode.feedback }) };
  }
  return { modes, warnings: theme.warnings, issues: theme.issues };
}

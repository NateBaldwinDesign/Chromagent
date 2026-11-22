import { generateTheme, type Theme } from "../theme/generateTheme";
import type { ThemeConfig } from "../theme/config";
import { cssVariables } from "../output/css";

/** A person's own color choices. Leave a field out to keep the theme's default. */
export interface Personalization {
  /** Background lightness from 0 (black) to 1 (white). */
  backgroundLightness?: number;
  /** Contrast multiplier: 1 = regular, above 1 = more contrast (up to about 2), below 1 = less (down to 0.5). */
  contrast?: number;
}

export interface PersonalizeOptions {
  /** Custom property prefix, matching the static CSS. Default "color". */
  prefix?: string;
}

/** Anything with a `style.setProperty`, such as `document.documentElement`. */
export interface StyleTarget {
  style: { setProperty(name: string, value: string): void };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Regenerates the theme's colors for one person's choices, with the same roles and variable names
 * as the static CSS. Contrast floors still hold; a lower contrast choice never drops text below 4.5:1.
 */
export function personalizeTheme(config: ThemeConfig, choice: Personalization): Theme {
  const lightness = clamp(choice.backgroundLightness ?? config.background?.lightness ?? 1, 0, 1);
  const multiplier = clamp(choice.contrast ?? 1, 0.5, 2);
  return generateTheme({
    ...config,
    modes: { personal: { backgroundLightness: lightness, contrastMultiplier: multiplier, media: false } },
    defaultMode: "personal",
  });
}

/** The CSS custom properties for a person's choices, plus `color-scheme`. */
export function personalizedVariables(config: ThemeConfig, choice: Personalization, options: PersonalizeOptions = {}) {
  const mode = personalizeTheme(config, choice).modes.personal;
  return {
    "color-scheme": mode.settings.backgroundLightness < 0.5 ? "dark" : "light",
    ...cssVariables(mode, options.prefix),
  } as Record<string, string>;
}

/**
 * Writes personalized colors onto an element (default: the page root). The static light, dark, and
 * contrast schemes stay in your CSS as the fallback; inline variables simply override them.
 */
export function personalize(
  config: ThemeConfig,
  choice: Personalization,
  target?: StyleTarget,
  options: PersonalizeOptions = {},
) {
  const element = target ?? (globalThis as { document?: { documentElement: StyleTarget } }).document?.documentElement;
  if (!element) throw new Error("personalize() needs a target element when there is no document (for example on a server).");
  const vars = personalizedVariables(config, choice, options);
  for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value);
  return vars;
}

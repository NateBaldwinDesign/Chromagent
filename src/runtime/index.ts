import { generateTheme, type Theme } from "../theme/generateTheme";
import { normalizeConfig, type ThemeConfig } from "../theme/config";
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

/** Clamps to a range; anything that isn't a finite number (NaN, a string from a form field) uses the fallback. */
const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

function resolveChoice(config: ThemeConfig, choice: Personalization) {
  const fallback = clamp(config.background?.lightness, 1, 0, 1);
  return {
    lightness: clamp(choice?.backgroundLightness, fallback, 0, 1),
    multiplier: clamp(choice?.contrast, 1, 0.5, 2),
  };
}

function themeFor(config: ThemeConfig, { lightness, multiplier }: ReturnType<typeof resolveChoice>) {
  return generateTheme({
    ...config,
    modes: { personal: { backgroundLightness: lightness, contrastMultiplier: multiplier, media: false } },
    defaultMode: "personal",
  });
}

function variablesOf(theme: Theme, prefix?: string) {
  const mode = theme.modes.personal;
  return {
    "color-scheme": mode.settings.backgroundLightness < 0.5 ? "dark" : "light",
    ...cssVariables(mode, prefix),
  } as Record<string, string>;
}

function rootElement(target?: StyleTarget) {
  const element = target ?? (globalThis as { document?: { documentElement: StyleTarget } }).document?.documentElement;
  if (!element) throw new Error("personalize() needs a target element when there is no document (for example on a server).");
  return element;
}

/**
 * Regenerates the theme's colors for one person's choices, with the same roles and variable names
 * as the static CSS. Contrast floors still hold; a lower contrast choice never drops text below 4.5:1.
 */
export function personalizeTheme(config: ThemeConfig, choice: Personalization): Theme {
  return themeFor(config, resolveChoice(config, choice));
}

/** The CSS custom properties for a person's choices, plus `color-scheme`. */
export function personalizedVariables(config: ThemeConfig, choice: Personalization, options: PersonalizeOptions = {}) {
  return variablesOf(personalizeTheme(config, choice), options.prefix);
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
  const element = rootElement(target);
  const vars = personalizedVariables(config, choice, options);
  for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value);
  return vars;
}

export interface Personalizer {
  theme(choice: Personalization): Theme;
  variables(choice: Personalization): Record<string, string>;
  /** Like `personalize()`: writes the variables onto an element (default: the page root). */
  apply(choice: Personalization, target?: StyleTarget): Record<string, string>;
}

const PERSONALIZER_CACHE = 16;

/**
 * Checks the settings once (throwing ThemeConfigError right away if they are invalid) and remembers
 * recent choices, so moving a slider back and forth doesn't rebuild the same theme. The settings are
 * copied when you create it; create a new personalizer if they change.
 */
export function createPersonalizer(config: ThemeConfig, options: PersonalizeOptions = {}): Personalizer {
  const settings = structuredClone(config);
  normalizeConfig(settings);
  const themes = new Map<string, { theme: Theme; vars?: Record<string, string> }>();
  const entry = (choice: Personalization) => {
    const resolved = resolveChoice(settings, choice);
    const key = `${resolved.lightness}|${resolved.multiplier}`;
    let found = themes.get(key);
    if (found) themes.delete(key);
    else found = { theme: themeFor(settings, resolved) };
    themes.set(key, found);
    if (themes.size > PERSONALIZER_CACHE) themes.delete(themes.keys().next().value!);
    return found;
  };
  const variables = (choice: Personalization) => {
    const found = entry(choice);
    return (found.vars ??= variablesOf(found.theme, options.prefix));
  };
  // Builds the default choice now, so a bad prefix fails here rather than on the first slider move.
  variables({});
  return {
    theme: (choice) => entry(choice).theme,
    variables: (choice) => ({ ...variables(choice) }),
    apply(choice, target) {
      const element = rootElement(target);
      const vars = variables(choice);
      for (const [name, value] of Object.entries(vars)) element.style.setProperty(name, value);
      return { ...vars };
    },
  };
}

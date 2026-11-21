import Color from "colorjs.io";
import type { Theme, ThemeMode, ColorValue } from "../theme/generateTheme";

/** A Design Tokens Community Group (DTCG 2025.10) color token. */
export interface DtcgColorToken {
  $type: "color";
  $value: { colorSpace: string; components: number[]; hex: string } | string;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

export type DtcgGroup = { [key: string]: DtcgGroup | DtcgColorToken | string };

const SPACE: Record<string, { colorjs: string; dtcg: string }> = {
  oklch: { colorjs: "oklch", dtcg: "oklch" },
  srgb: { colorjs: "srgb", dtcg: "srgb" },
  "display-p3": { colorjs: "p3", dtcg: "display-p3" },
  rec2020: { colorjs: "rec2020", dtcg: "rec2020" },
};

function token(value: ColorValue, theme: Theme): DtcgColorToken {
  const space = theme.format === "oklch" ? SPACE.oklch : SPACE[theme.gamut];
  const components = new Color(value.css).to(space.colorjs).coords.map((c, i) => {
    const n = Number(c);
    if (!Number.isFinite(n)) return 0;
    return Number(n.toFixed(i === 2 && space.dtcg === "oklch" ? 2 : 5));
  });
  return {
    $type: "color",
    $value: { colorSpace: space.dtcg, components, hex: value.hex },
    $extensions: {
      chromagent: { contrast: value.contrast, target: value.target, formula: theme.formula, ...(value.capped && { capped: true }) },
    },
  };
}

/** Design tokens (DTCG format) for one mode. Roles are aliases such as "{color.gray.1400}". */
export function toDtcg(theme: Theme, modeName: string = theme.defaultMode): DtcgGroup {
  const mode: ThemeMode | undefined = theme.modes[modeName];
  if (!mode) throw new Error(`Mode "${modeName}" does not exist. Modes: ${Object.keys(theme.modes).join(", ")}.`);
  const color: DtcgGroup = {};
  for (const [scale, steps] of Object.entries(mode.scales)) {
    const group: DtcgGroup = {};
    for (const [step, value] of Object.entries(steps)) group[step] = token(value, theme);
    color[scale] = group;
  }
  const surface: DtcgGroup = {};
  for (const [name, value] of Object.entries(mode.surfaces)) surface[name] = token(value, theme);
  color.surface = surface;
  for (const [role, value] of Object.entries(mode.roles))
    color[role] = { $type: "color", $value: `{color.${value.ref}}` } as DtcgColorToken;
  return { $description: `chromagent "${mode.name}" mode`, color } as DtcgGroup;
}

/** Design tokens for every mode, keyed by mode name (one token file per mode). */
export function toDtcgModes(theme: Theme): Record<string, DtcgGroup> {
  return Object.fromEntries(Object.keys(theme.modes).map((name) => [name, toDtcg(theme, name)]));
}

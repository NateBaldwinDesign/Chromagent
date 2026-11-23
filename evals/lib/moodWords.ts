import ColorDescription from "color-description";
import Color from "colorjs.io";

/**
 * All the words an independent library (color-description) uses for a color, lowercased.
 * The engine has its own word table, so grading with a different source keeps the check honest.
 */
export function moodText(color: string): string {
  const srgb = new Color(color).toGamut({ space: "srgb", method: "css" }).to("srgb").toString({ format: "hex" });
  const d = new ColorDescription(srgb);
  return [d.getDescriptiveList(false, 3), ...d.descriptiveWords, ...d.nouns, ...d.meanings, ...d.effects, ...d.usage, ...(d.temperatureWords?.descriptive ?? [])]
    .join(" ")
    .toLowerCase();
}

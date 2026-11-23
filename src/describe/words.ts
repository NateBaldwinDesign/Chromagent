/**
 * A small, hand-written table of color words, keyed on OKLCH lightness, chroma, and hue.
 * The associations are common English, mostly Western tendencies, not rules.
 */

export type Temperature = "warm" | "cool" | "neutral";

export interface Family {
  name: string;
  nouns: string[];
  /** Extra nouns for light (L ≥ 0.78) or dark (L < 0.45) versions. */
  light?: string[];
  dark?: string[];
  meanings: string[];
  effects: string[];
  usage: string[];
  /** Families that read as earthy when muted. */
  earthy?: true;
}

const f = (name: string, nouns: string, meanings: string, effects: string, usage: string, extra: Partial<Family> = {}): Family => ({
  name,
  nouns: nouns.split(", "),
  meanings: meanings.split(", "),
  effects: effects.split(", "),
  usage: usage.split(", "),
  ...extra,
});

const FAMILIES = {
  red: f("red", "red, cherry, ruby, tomato, scarlet", "passion, energy, love, urgency, courage, excitement, danger", "excite, energize, alert, stimulate", "sales, food, sports, alerts, action", { light: ["coral", "salmon"], dark: ["maroon", "wine", "burgundy"], earthy: true }),
  orange: f("orange", "orange, tangerine, pumpkin, apricot, amber", "enthusiasm, warmth, creativity, friendliness, fun, adventure, playful, cozy, autumn", "energize, cheer, invite, excite", "food, kids, entertainment, sports, action", { light: ["peach"], dark: ["rust", "copper"], earthy: true }),
  yellow: f("yellow", "yellow, gold, sunflower, lemon, sunshine", "happiness, optimism, joy, attention, caution, summer", "cheer, energize, uplift, attract", "highlights, kids, food, summer, caution", { light: ["butter", "cream"], dark: ["mustard"], earthy: true }),
  green: f("green", "green, leaf, grass, emerald, fern", "nature, growth, health, freshness, balance, renewal, harmony, ecology", "calm, refresh, restore, reassure", "environment, health, finance, wellness, outdoors, organic", { light: ["mint", "lime"], dark: ["forest", "pine"], earthy: true }),
  teal: f("teal", "teal, turquoise, aqua, cyan, lagoon", "clarity, calm, healing, balance, ocean, sophistication, modern", "calm, refresh, soothe", "health, wellness, technology, spa, travel", { light: ["seafoam"], dark: ["petrol"] }),
  blue: f("blue", "blue, sky, ocean, sapphire, cobalt", "trust, calm, stability, dependability, intelligence, peace, professionalism, security, loyalty, modern", "calm, reassure, focus, cool", "finance, technology, healthcare, corporate, banking, links", { light: ["ice"], dark: ["navy", "midnight"] }),
  purple: f("purple", "purple, violet, plum, amethyst, iris", "luxury, royalty, creativity, mystery, wisdom, spirituality, imagination", "inspire, intrigue, soothe", "beauty, luxury, creative, wellness, premium", { light: ["lavender", "lilac"], dark: ["eggplant", "aubergine"] }),
  pink: f("pink", "pink, rose, magenta, fuchsia, raspberry", "romance, playfulness, tenderness, sweetness, fun, compassion, youth, playful", "soothe, delight, charm, excite", "beauty, fashion, kids, sweets, cosmetics", { light: ["blush", "petal"], dark: ["berry"] }),
  brown: f("brown", "brown, chocolate, coffee, wood, earth, clay, chestnut, terracotta", "earth, nature, stability, comfort, reliability, warmth, rustic, grounded, cozy, autumn", "ground, comfort, reassure", "coffee, food, outdoors, furniture, bakery, organic", { earthy: true }),
  olive: f("olive", "olive, khaki, moss, sage, earth", "nature, peace, earth, tradition, grounded, autumn", "ground, calm", "outdoors, organic, food, fashion", { earthy: true }),
  tan: f("tan", "tan, sand, beige, oat, wheat, latte, earth", "simplicity, warmth, comfort, earth, natural, softness, cozy", "calm, ground, soften", "backgrounds, interiors, fashion, organic, bakery", { earthy: true }),
  black: f("black", "black, ink, charcoal, coal, night", "power, elegance, sophistication, formality, mystery, luxury, authority", "contrast, focus, intimidate", "luxury, fashion, typography, technology"),
  grey: f("grey", "grey, gray, stone, slate, ash, silver, concrete, fog", "neutrality, balance, professionalism, restraint, calm, modern, minimal", "neutralize, balance, recede", "backgrounds, interfaces, typography, corporate"),
  white: f("white", "white, snow, cloud, paper, porcelain", "purity, simplicity, cleanliness, clarity, peace, minimalism", "open, refresh, clarify", "backgrounds, healthcare, minimal, weddings"),
} satisfies Record<string, Family>;

const inHue = (h: number, from: number, to: number) => (from <= to ? h >= from && h < to : h >= from || h < to);

/** Picks the color family. Muted dark warm hues become brown or olive; pale warm ones become tan. */
export function familyOf(l: number, c: number, h: number): Family {
  if (c < 0.025) return l < 0.3 ? FAMILIES.black : l > 0.93 ? FAMILIES.white : FAMILIES.grey;
  if (inHue(h, 15, 38)) return l < 0.6 && c < 0.13 ? FAMILIES.brown : l >= 0.8 ? FAMILIES.pink : FAMILIES.red;
  if (inHue(h, 38, 75)) return l < 0.6 ? FAMILIES.brown : l >= 0.75 && c < 0.08 ? FAMILIES.tan : FAMILIES.orange;
  if (inHue(h, 75, 115)) return l < 0.65 ? FAMILIES.olive : l >= 0.75 && c < 0.08 ? FAMILIES.tan : FAMILIES.yellow;
  if (inHue(h, 115, 170)) return FAMILIES.green;
  if (inHue(h, 170, 220)) return FAMILIES.teal;
  if (inHue(h, 220, 285)) return FAMILIES.blue;
  if (inHue(h, 285, 335)) return FAMILIES.purple;
  return FAMILIES.pink;
}

export function temperatureOf(c: number, h: number): Temperature {
  if (c < 0.025) return "neutral";
  if (inHue(h, 330, 105)) return "warm";
  if (inHue(h, 150, 290)) return "cool";
  return "neutral";
}

/** Adjectives in the order they best summarize a color: lightness and strength first, then mood. */
const ADJECTIVES: [word: string, test: (l: number, c: number, family: Family, t: Temperature) => boolean][] = [
  ["bright", (l, c) => l >= 0.6 && c >= 0.12],
  ["vivid", (_, c) => c >= 0.15],
  ["brilliant", (l, c) => l >= 0.6 && c >= 0.18],
  ["saturated", (_, c) => c >= 0.18],
  ["rich", (l, c) => c >= 0.1 && l >= 0.35 && l < 0.7],
  ["deep", (l, c) => l < 0.45 && c >= 0.06],
  ["dark", (l) => l < 0.45],
  ["light", (l) => l >= 0.75],
  ["pale", (l, c) => l >= 0.82 && c <= 0.1],
  ["pastel", (l, c) => l >= 0.78 && c >= 0.04 && c < 0.14],
  ["soft", (l, c) => l >= 0.65 && c >= 0.025 && c < 0.12],
  ["muted", (l, c) => l < 0.82 && c >= 0.025 && c < 0.09],
  ["dusty", (l, c) => l >= 0.5 && l < 0.8 && c >= 0.03 && c < 0.08],
  ["mellow", (l, c, _, t) => t === "warm" && l >= 0.55 && l < 0.85 && c >= 0.04 && c < 0.12],
  ["earthy", (l, c, family) => !!family.earthy && l >= 0.35 && l < 0.75 && c >= 0.03 && c < 0.14],
  ["calm", (l, c, family) => (["green", "teal", "blue", "olive"].includes(family.name) && c < 0.13) || (l >= 0.6 && c < 0.08)],
  ["fresh", (l, c, family) => ["green", "teal"].includes(family.name) && l >= 0.65 && c >= 0.08],
  ["energetic", (_, c, __, t) => t === "warm" && c >= 0.15],
  ["playful", (l, c, family) => ["red", "orange", "yellow", "pink", "purple", "green"].includes(family.name) && l >= 0.6 && c >= 0.12],
  ["cozy", (l, c, _, t) => t === "warm" && l >= 0.35 && l < 0.7 && c >= 0.04 && c < 0.14],
  ["moody", (l, c) => l < 0.4 && c < 0.1],
  ["neutral", (_, c) => c < 0.025],
];

export function adjectivesOf(l: number, c: number, family: Family, temperature: Temperature) {
  return ADJECTIVES.filter(([, test]) => test(l, c, family, temperature)).map(([word]) => word);
}

import Color from "../math/color";
import { adjectivesOf, familyOf, temperatureOf } from "./words";
import { round } from "../theme/values";

export interface ColorWords {
  /** A short plain-language summary, such as "rich, golden and warm". */
  summary: string;
  /** Adjectives that describe how the color looks. */
  words: string[];
  /** Things the color brings to mind. */
  nouns: string[];
  /** Common symbolic meanings. */
  meanings: string[];
  /** Common emotional effects. */
  effects: string[];
  /** Common design uses. */
  usage: string[];
  /** Warm or cool feel, such as "warm" or "cool daylight". */
  temperature: string[];
}

export interface SuggestedColor {
  /** The color as an OKLCH CSS string. Inside sRGB, so it works everywhere. */
  css: string;
  hex: string;
  oklch: [number, number, number];
  /** How strongly it matched (higher is better). */
  score: number;
  /** Which of your words this color matched. */
  matched: string[];
  /** Plain-language description of this color. */
  summary: string;
}

export interface Suggestions {
  colors: SuggestedColor[];
  /** Words from the prompt that matched at least one color. */
  matchedWords: string[];
  /** Words that matched nothing. If every word is here, `colors` is empty. */
  unmatchedWords: string[];
}

export interface SuggestOptions {
  /** How many candidates to return. Default 6. */
  count?: number;
}

const STOPWORDS = new Set(
  "a an and are as at be but by colors colour colours color feel feeling for from give has have i in into is it its like look looks make me more most my of on or our please so some that the theme this to very want we website site app with".split(
    " ",
  ),
);

const SUFFIXES = ["iness", "ness", "ing", "ful", "ous", "ish", "ity", "ly", "ed", "es", "s", "y"];

/** Very light stemming so "calming", "calmness", and "calm" all match. */
export function stem(word: string) {
  for (const suffix of SUFFIXES)
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length);
  return word;
}

function wordsMatch(a: string, b: string) {
  if (a === b) return true;
  const sa = stem(a);
  const sb = stem(b);
  return sa === sb || (sa.length >= 5 && sb.length >= 5 && sa.slice(0, 5) === sb.slice(0, 5));
}

/** Splits a prompt into meaningful lowercase words. */
export function promptWords(prompt: string) {
  const seen = new Set<string>();
  for (const word of prompt.toLowerCase().split(/[^a-z]+/))
    if (word.length > 1 && !STOPWORDS.has(word)) seen.add(word);
  return [...seen];
}

const tokens = (phrase: string) => phrase.toLowerCase().split(/[^a-z]+/).filter(Boolean);


/** "a, b and c" */
function list(words: string[]) {
  return words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function wordsFor(l: number, c: number, h: number): ColorWords {
  const family = familyOf(l, c, h);
  const temperature = temperatureOf(c, h);
  const nouns = [...((l >= 0.78 && family.light) || (l < 0.45 && family.dark) || []), ...family.nouns];
  const words = adjectivesOf(l, c, family, temperature);
  if (words.length === 0) words.push(family.name);
  return {
    summary: list(words.slice(0, 3)),
    words,
    nouns,
    meanings: family.meanings,
    effects: family.effects,
    usage: family.usage,
    temperature: [temperature],
  };
}

/** Describes a CSS color in plain words. Use it to explain color choices and check they fit the brief. */
export function describeColor(color: string): ColorWords {
  // The word table is tuned for colors people can see on ordinary screens, so map wide-gamut colors into sRGB first.
  const [l, c, h] = new Color(color).toGamut({ space: "srgb", method: "css" }).to("oklch").coords.map((v) => Number(v) || 0);
  return wordsFor(l, c, h);
}

interface GridEntry {
  css: string;
  oklch: [number, number, number];
  lab: [number, number, number];
  categories: { weight: number; tokens: Set<string> }[];
  summary: string;
}

let grid: GridEntry[] | undefined;

/** A grid of sRGB-safe OKLCH colors, each with its description (built once, on first use). */
function colorGrid() {
  if (grid) return grid;
  grid = [];
  for (let l = 0.35; l <= 0.9001; l += 0.05)
    for (let c = 0.03; c <= 0.2701; c += 0.03)
      for (let h = 0; h < 360; h += 15) {
        const color = new Color("oklch", [l, c, h]);
        if (!color.inGamut("srgb")) continue;
        const css = `oklch(${round(l * 100, 2)}% ${round(c, 3)} ${h})`;
        const d = wordsFor(l, c, h);
        const words = (items: string[]) => new Set(items.flatMap(tokens));
        const lab = color.to("oklab").coords.map(Number) as [number, number, number];
        grid.push({
          css,
          oklch: [round(l, 4), round(c, 4), h],
          lab,
          categories: [
            { weight: 1, tokens: words(d.words.slice(0, 3)) },
            { weight: 3, tokens: words(d.words) },
            { weight: 3, tokens: words(d.nouns) },
            { weight: 2, tokens: words([...d.meanings, ...d.effects, ...d.usage, ...d.temperature]) },
          ],
          summary: d.summary,
        });
      }
  return grid;
}

/** Adds up the weight of every category the word appears in, so stronger associations rank higher. */
function scoreWord(entry: GridEntry, word: string) {
  let total = 0;
  for (const category of entry.categories) {
    for (const token of category.tokens)
      if (wordsMatch(word, token)) {
        total += category.weight;
        break;
      }
  }
  return total;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Within each group of equal matches, put the most typical colors (closest to the group's median lightness and chroma) first. */
function sortTiesByTypicality(items: { entry: GridEntry; matched: string[]; score: number }[]) {
  let start = 0;
  while (start < items.length) {
    let end = start;
    while (end < items.length && items[end].score === items[start].score && items[end].matched.length === items[start].matched.length)
      end += 1;
    const group = items.slice(start, end);
    const l = median(group.map((item) => item.entry.oklch[0]));
    const c = median(group.map((item) => item.entry.oklch[1]));
    const away = (entry: GridEntry) => Math.hypot(entry.oklch[0] - l, (entry.oklch[1] - c) * 2);
    group.sort((a, b) => away(a.entry) - away(b.entry));
    items.splice(start, group.length, ...group);
    start = end;
  }
}

const distance = (a: GridEntry, b: GridEntry) => Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);

/**
 * Turns descriptive words ("bright vivid", "calm and earthy", "luxury") into a short list of
 * candidate key colors. Treat the results as a starting point: the word data is English and
 * reflects mostly Western color associations.
 */
export function suggestColors(prompt: string, options: SuggestOptions = {}): Suggestions {
  const count = Math.max(1, Math.floor(options.count ?? 6));
  const words = promptWords(prompt);
  const matchedWords = new Set<string>();
  const entries = colorGrid();
  const scored = entries
    .map((entry) => {
      const matched: string[] = [];
      let score = 0;
      for (const word of words) {
        const value = scoreWord(entry, word);
        if (value > 0) {
          matched.push(word);
          matchedWords.add(word);
          score += value;
        }
      }
      return { entry, matched, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.matched.length - a.matched.length || b.score - a.score);
  sortTiesByTypicality(scored);

  // Keep picks visibly different from each other.
  const picks: typeof scored = [];
  for (const item of scored) {
    if (picks.length >= count) break;
    if (picks.every((pick) => distance(pick.entry, item.entry) > 0.06)) picks.push(item);
  }

  return {
    colors: picks.map(({ entry, matched, score }) => ({
      css: entry.css,
      hex: new Color(entry.css).to("srgb").toString({ format: "hex", collapse: false }),
      oklch: entry.oklch,
      score,
      matched,
      summary: entry.summary,
    })),
    matchedWords: words.filter((word) => matchedWords.has(word)),
    unmatchedWords: words.filter((word) => !matchedWords.has(word)),
  };
}

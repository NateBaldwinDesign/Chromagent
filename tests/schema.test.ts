import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { generateTheme } from "../src";

const assets = join(__dirname, "..", "skills", "chromagentic", "assets");
const schema = JSON.parse(readFileSync(join(assets, "theme.schema.json"), "utf8"));
const validate = new Ajv({ allErrors: true }).compile(schema);
const examples = readdirSync(assets).filter((file) => file.startsWith("example-"));

describe("settings schema", () => {
  it.each(examples)("accepts and generates %s without warnings", (file) => {
    const config = JSON.parse(readFileSync(join(assets, file), "utf8"));
    expect(validate(config), JSON.stringify(validate.errors)).toBe(true);
    expect(generateTheme(config).warnings).toEqual([]);
  });

  it.each([
    [{}],
    [{ colors: {} }],
    [{ colors: { blue: "#00f" }, formula: "wcag3" }],
    [{ colors: { blue: "#00f" }, modes: { dark: { backgroundLightness: 2 } } }],
    [{ colors: { blue: "#00f" }, modes: { dark: { media: true } } }],
    [{ colors: { blue: "#00f" }, colour: "typo" }],
  ])("rejects bad settings: %j", (config) => {
    expect(validate(config)).toBe(false);
  });
});

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const skillDir = join(root, "skills", "chromagentic");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const json = (path: string) => JSON.parse(read(path));

function frontmatter() {
  const text = read("skills/chromagentic/SKILL.md");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error("SKILL.md has no frontmatter");
  const [, head, body] = match;
  const field = (name: string) => new RegExp(`^${name}: (.*)$`, "m").exec(head)?.[1]?.trim();
  const version = /^metadata:\n(?: {2}.*\n)*? {2}version: "?([^"\n]+)"?/m.exec(head + "\n")?.[1];
  return { name: field("name"), description: field("description"), license: field("license"), compatibility: field("compatibility"), version, body };
}

describe("skill folder", () => {
  it("follows the Agent Skills format", () => {
    const fm = frontmatter();
    expect(fm.name).toBe("chromagentic");
    expect(fm.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(fm.description?.length).toBeGreaterThan(0);
    expect(fm.description!.length).toBeLessThanOrEqual(1024);
    expect(fm.license).toBe("Apache-2.0");
    expect(fm.compatibility).toBe("Requires Node.js 20+");
    // About 4 characters per token: stay well under the 5,000-token body budget.
    expect(fm.body.length).toBeLessThan(20000);
    expect(fm.body.split("\n").length).toBeLessThan(500);
  });

  it("uses one version number everywhere", () => {
    const version = json("package.json").version;
    expect(frontmatter().version).toBe(version);
    expect(json(".claude-plugin/plugin.json").version).toBe(version);
    expect(json(".claude-plugin/marketplace.json").plugins[0].version).toBe(version);
  });

  it("points the Claude plugin at the skill", () => {
    const marketplace = json(".claude-plugin/marketplace.json");
    expect(marketplace.plugins[0].name).toBe(json(".claude-plugin/plugin.json").name);
    expect(marketplace.plugins[0].source).toBe("./");
  });

  it("ships the skill folder in the npm package", () => {
    expect(json("package.json").files).toContain("skills");
  });

  it("carries the license and credits, since the skill can be installed on its own", () => {
    expect(read("skills/chromagentic/NOTICE")).toBe(read("NOTICE"));
    expect(read("skills/chromagentic/LICENSE.txt")).toBe(read("LICENSE"));
  });

  describe("bundled engine", () => {
    // Copy only the skill folder somewhere with no node_modules, like a real install.
    const dir = mkdtempSync(join(tmpdir(), "chromagentic-skill-"));
    cpSync(skillDir, join(dir, "chromagentic"), { recursive: true });
    const script = join(dir, "chromagentic", "scripts", "chromagentic.mjs");
    const run = (...args: string[]) => execFileSync(process.execPath, [script, ...args], { cwd: dir, encoding: "utf8" });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("runs offline with no installed packages", () => {
      expect(run("--version").trim()).toBe(json("package.json").version);
      expect(run("contrast", "#5b6672", "#ffffff")).toContain("5.85");
      expect(run("describe", "#ff5a00").length).toBeGreaterThan(0);
    });

    it("generates every example settings file", () => {
      for (const name of ["example-basic.json", "example-all-modes.json", "example-apca.json"]) {
        const out = JSON.parse(run("generate", join(dir, "chromagentic", "assets", name), "--format", "json"));
        expect(Object.keys(out.modes).length).toBeGreaterThan(0);
      }
    });

    it("matches the light mode of a hand-made theme when converting it", () => {
      const settings = join(dir, "convert.json");
      writeFileSync(settings, JSON.stringify({
        colors: { gray: ["#d1d5db", "#4b5563", "#111827"], brand: "#2563eb" },
        background: { color: "gray" },
        steps: { border: 1.47, muted: 7.55, text: 17.73, accent: 5.16 },
        roles: { text: "gray.text", "text-subtle": "gray.muted", border: "gray.border", accent: "brand.accent" },
        modes: { light: { backgroundLightness: 1 }, dark: { backgroundLightness: 0.12 } },
      }));
      const out = JSON.parse(run("generate", settings, "--format", "json"));
      expect(out.modes.light.roles["text-subtle"].hex).toBe("#4b5563");
      expect(out.modes.light.roles.border.hex).toBe("#d1d5db");
      expect(out.modes.dark.roles.text.contrast).toBeGreaterThanOrEqual(17.73);
      expect(out.warnings).toEqual([]);
    });
  });
});

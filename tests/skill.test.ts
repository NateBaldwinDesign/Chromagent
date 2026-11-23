import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    expect(fm.compatibility).toBe("Requires Node.js 22+");
    // About 4 characters per token: stay well under the 5,000-token body budget.
    expect(fm.body.length).toBeLessThan(20000);
    expect(fm.body.split("\n").length).toBeLessThan(500);
  });

  const refDir = join(skillDir, "references");
  const refFiles = readdirSync(refDir).sort();
  const docs = () => [["SKILL.md", frontmatter().body], ...refFiles.map((f) => [`references/${f}`, readFileSync(join(refDir, f), "utf8")])];

  it("lists every reference file once in the \"Open it when\" table, and links only to files that exist", () => {
    const body = frontmatter().body;
    const table = [...body.matchAll(/^\| `references\/([a-z-]+\.md)` \| (.+) \|$/gm)];
    expect(table.map((m) => m[1]).sort()).toEqual(refFiles);
    for (const [, , when] of table) expect(when.trim().length).toBeGreaterThan(0);
    for (const [name, text] of docs()) {
      for (const [, file] of text.matchAll(/references\/([a-z-]+\.md)/g)) expect(refFiles, `${name} links ${file}`).toContain(file);
    }
  });

  it("points only at sections that exist", () => {
    let found = 0;
    const headings = new Map(refFiles.map((f) => [f, [...readFileSync(join(refDir, f), "utf8").matchAll(/^#+ (.+)$/gm)].map((m) => m[1])]));
    for (const [name, text] of docs()) {
      for (const [, file, section] of text.matchAll(/`references\/([a-z-]+\.md)`, "([^"]+)"/g)) {
        found++;
        expect(headings.get(file)!.some((h) => h.startsWith(section)), `${name}: ${file} "${section}"`).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it("points only at bundled assets and scripts that exist", () => {
    let found = 0;
    for (const [name, text] of docs()) {
      for (const [, path] of text.matchAll(/<skill-dir>\/((?:assets|scripts)\/[\w.-]+\.\w+)/g)) {
        found++;
        expect(existsSync(join(skillDir, path)), `${name}: ${path}`).toBe(true);
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it("says when not to use the skill", () => {
    expect(frontmatter().description).toMatch(/Not for .+data-visualization/);
  });

  it("uses one version number everywhere", () => {
    const version = json("package.json").version;
    expect(frontmatter().version).toBe(version);
    expect(json(".claude-plugin/plugin.json").version).toBe(version);
    // plugin.json is the only place the plugin version lives; the marketplace entry must not override it.
    expect(json(".claude-plugin/marketplace.json").plugins[0].version).toBeUndefined();
  });

  it("copies a new package version to the plugin, the skill, and pinned doc links without touching anything else", () => {
    const dir = mkdtempSync(join(tmpdir(), "sync-"));
    try {
      const docs = ["README.md", "skills/chromagentic/references/engine.md"];
      for (const file of [".claude-plugin/plugin.json", "skills/chromagentic/SKILL.md", ...docs]) cpSync(join(root, file), join(dir, file));
      writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "9.8.7" }));
      execFileSync(process.execPath, [join(root, "scripts/sync-version.mjs")], { cwd: dir, stdio: "pipe" });
      const plugin = readFileSync(join(dir, ".claude-plugin/plugin.json"), "utf8");
      const skill = readFileSync(join(dir, "skills/chromagentic/SKILL.md"), "utf8");
      const oldVersion = json("package.json").version;
      expect(JSON.parse(plugin).version).toBe("9.8.7");
      expect(plugin).toBe(read(".claude-plugin/plugin.json").replace(`"${oldVersion}"`, '"9.8.7"'));
      expect(skill).toBe(read("skills/chromagentic/SKILL.md").replace(`version: "${oldVersion}"`, 'version: "9.8.7"'));
      for (const doc of docs) {
        const synced = readFileSync(join(dir, doc), "utf8");
        expect(synced).toContain("Chromagentic/v9.8.7/skills/chromagentic/assets/theme.schema.json");
        expect(synced).not.toContain(`v${oldVersion}`);
        expect(synced).toBe(read(doc).replaceAll(`v${oldVersion}`, "v9.8.7"));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

    it("only names commands the engine has", () => {
      const help = run("--help");
      const named = new Set([...frontmatter().body.matchAll(/`chromagentic ([a-z][a-z-]*)/g)].map((m) => m[1]));
      expect(named.size).toBeGreaterThan(3);
      for (const command of named) expect(help, command).toContain(`chromagentic ${command} `);
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
        roles: { text: "gray.text", "text-subtle": "gray.muted", border: { ref: "gray.border", kind: "tint" }, accent: "brand.accent" },
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

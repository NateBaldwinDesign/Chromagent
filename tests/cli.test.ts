import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run, type CliIO } from "../src/cli/run";
import { splitFrontmatter } from "../src/cli/init";

let dir: string;
let skill: string;

function io(extra: Partial<CliIO> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const value: CliIO = { stdout: (t) => out.push(t), stderr: (t) => err.push(t), cwd: dir, skillSource: skill, ...extra };
  return { io: value, out: () => out.join(""), err: () => err.join("") };
}

async function tree(root: string, base = root): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) Object.assign(result, await tree(path, base));
    else result[path.slice(base.length + 1)] = await readFile(path, "utf8");
  }
  return result;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "chromagent-cli-"));
  skill = join(dir, "skill-source");
  await mkdir(join(skill, "references"), { recursive: true });
  await writeFile(
    join(skill, "SKILL.md"),
    "---\nname: chromagent\ndescription: Color for UI.\n---\n# Chromagent\nSee [contrast](references/contrast.md) or `references/contrast.md`.\n",
  );
  await writeFile(join(skill, "references", "contrast.md"), "# Contrast\n");
  await writeFile(join(dir, "theme.json"), JSON.stringify({ colors: { blue: "#0265dc" } }));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("generate", () => {
  it("prints CSS by default", async () => {
    const t = io();
    expect(await run(["generate", "theme.json"], t.io)).toBe(0);
    expect(t.out()).toContain(":root, [data-theme=\"light\"]");
    expect(t.out()).toContain("--color-blue-900:");
    expect(t.out()).toContain("[data-theme=\"dark\"]");
  });

  it("writes Tailwind v4 output", async () => {
    const t = io();
    await run(["generate", "theme.json", "--format", "tailwind"], t.io);
    expect(t.out()).toContain("@theme {");
  });

  it("writes JSON and respects --platform", async () => {
    const t = io();
    await run(["generate", "theme.json", "--format", "json", "--platform", "ios"], t.io);
    const theme = JSON.parse(t.out());
    expect(theme.gamut).toBe("display-p3");
    expect(theme.modes.light.roles.text.css).toMatch(/^color\(display-p3 /);
  });

  it("writes one DTCG file per mode with --out", async () => {
    const t = io();
    expect(await run(["generate", "theme.json", "--format", "dtcg", "--out", "tokens"], t.io)).toBe(0);
    expect((await readdir(join(dir, "tokens"))).sort()).toEqual(["dark.tokens.json", "light.tokens.json"]);
    const light = JSON.parse(await readFile(join(dir, "tokens", "light.tokens.json"), "utf8"));
    expect(light.color.text.$value).toBe("{color.gray.1400}");
    expect(t.err()).toContain("Wrote 2 token files");
  });

  it("prints DTCG keyed by mode and writes CSS to a file", async () => {
    const t = io();
    await run(["generate", "theme.json", "--format", "dtcg"], t.io);
    expect(Object.keys(JSON.parse(t.out()))).toEqual(["light", "dark"]);
    await run(["generate", "theme.json", "--out", "out/colors.css"], t.io);
    expect(await readFile(join(dir, "out", "colors.css"), "utf8")).toContain("--color-text:");
  });

  it("reports warnings and fails with --strict", async () => {
    await writeFile(join(dir, "hard.json"), JSON.stringify({ colors: { brand: "#FF5A00" }, steps: [4.5, 21], roles: null, status: false, modes: { mid: { backgroundLightness: 0.5 } } }));
    const t = io();
    const code = await run(["generate", "hard.json", "--strict"], t.io);
    expect(t.err()).toMatchSnapshot();
    expect(code).toBe(1);
    expect(await run(["generate", "hard.json"], io().io)).toBe(0);
  });

  it.each([
    [["generate"], "Give one settings file"],
    [["generate", "missing.json"], "Can't read the settings file"],
    [["generate", "theme.json", "--format", "svg"], "--format must be"],
    [["generate", "theme.json", "--platform", "windows95"], 'Unknown platform "windows95"'],
    [["generate", "theme.json", "--nope"], "Unknown option"],
  ])("explains bad input: %j", async (args, message) => {
    const t = io();
    expect(await run(args, t.io)).toBe(1);
    expect(t.err()).toContain(message);
  });

  it("explains invalid JSON and invalid settings", async () => {
    await writeFile(join(dir, "broken.json"), "{ colors: ");
    await writeFile(join(dir, "invalid.json"), JSON.stringify({ colors: { blue: "not-a-color" }, defaultMode: "nope" }));
    const broken = io();
    expect(await run(["generate", "broken.json"], broken.io)).toBe(1);
    expect(broken.err()).toContain("is not valid JSON");
    const invalid = io();
    expect(await run(["generate", "invalid.json"], invalid.io)).toBe(1);
    expect(invalid.err()).toMatchSnapshot();
  });
});

describe("init", () => {
  it("installs the skill for every agent", async () => {
    const t = io();
    expect(await run(["init"], t.io)).toBe(0);
    expect(t.out()).toMatchSnapshot();
    const files = await tree(dir);
    expect(files[".github/skills/chromagent/SKILL.md"]).toContain("# Chromagent");
    expect(files[".claude/skills/chromagent/references/contrast.md"]).toBe("# Contrast\n");
    expect(files[".cursor/rules/chromagent/references/contrast.md"]).toBe("# Contrast\n");
    expect(files[".cursor/rules/chromagent.mdc"]).toMatchSnapshot();
  });

  it("gives the same result when run twice and removes stale files", async () => {
    await run(["init"], io().io);
    const first = await tree(dir);
    await writeFile(join(dir, ".claude/skills/chromagent/references/old.md"), "stale");
    await run(["init"], io().io);
    expect(await tree(dir)).toEqual(first);
  });

  it("installs one agent into another folder", async () => {
    const t = io();
    await run(["init", "--agent", "claude", "--dir", "app"], t.io);
    expect(Object.keys(await tree(join(dir, "app"))).sort()).toEqual([
      ".claude/skills/chromagent/SKILL.md",
      ".claude/skills/chromagent/references/contrast.md",
    ]);
  });

  it("rejects unknown agents", async () => {
    const t = io();
    expect(await run(["init", "--agent", "vim"], t.io)).toBe(1);
    expect(t.err()).toContain("--agent must be");
  });

  it("ships a real skill that installs", async () => {
    const t = io({ skillSource: undefined });
    expect(await run(["init", "--agent", "copilot"], t.io)).toBe(0);
    const files = await tree(join(dir, ".github"));
    expect(files["skills/chromagent/SKILL.md"]).toMatch(/^---\nname: chromagent\n/);
    expect(Object.keys(files).length).toBeGreaterThan(5);
  });

  it("reads frontmatter", () => {
    expect(splitFrontmatter('---\nname: x\ndescription: "Hi: there"\n---\nBody')).toEqual({
      fields: { name: "x", description: "Hi: there" },
      body: "Body",
    });
    expect(splitFrontmatter("No frontmatter").fields).toEqual({});
  });
});

describe("helper commands", () => {
  it("suggests and describes colors", async () => {
    const s = io();
    await run(["suggest", "calm", "earthy", "--count", "3"], s.io);
    expect(JSON.parse(s.out()).colors).toHaveLength(3);
    const d = io();
    await run(["describe", "#ff5a00"], d.io);
    expect(JSON.parse(d.out()).temperature.join(" ")).toContain("warm");
  });

  it("explains empty suggestions", async () => {
    const t = io();
    await run(["suggest", "zzzqqq"], t.io);
    expect(JSON.parse(t.out()).colors).toEqual([]);
    expect(t.err()).toContain("No colors matched");
  });

  it("measures contrast", async () => {
    const w = io();
    await run(["contrast", "#000", "#fff"], w.io);
    expect(w.out()).toBe("21.00:1\n");
    const a = io();
    await run(["contrast", "#000", "#fff", "--formula", "apca"], a.io);
    expect(a.out()).toMatch(/^Lc 10\d\.\d\n$/);
  });

  it.each([
    [["suggest"], "Give some words"],
    [["suggest", "calm", "--count", "0"], "--count must be"],
    [["describe"], "Give a color"],
    [["describe", "notacolor"], "doesn't look like a CSS color"],
    [["contrast", "#000"], "Give two colors"],
    [["contrast", "#000", "#fff", "--formula", "x"], "--formula must be"],
    [["contrast", "nope", "#fff"], "doesn't look like a CSS color"],
    [["dance"], 'Unknown command "dance"'],
  ])("explains bad input: %j", async (args, message) => {
    const t = io();
    expect(await run(args, t.io)).toBe(1);
    expect(t.err()).toContain(message);
  });

  it("prints help and version", async () => {
    const h = io();
    await run([], h.io);
    expect(h.out()).toContain("Usage:");
    const v = io({ version: "1.2.3" });
    await run(["--version"], v.io);
    expect(v.out()).toBe("1.2.3\n");
  });
});

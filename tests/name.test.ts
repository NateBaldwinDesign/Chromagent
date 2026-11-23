import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("project name", () => {
  it("uses Chromagentic everywhere except the changelog", () => {
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && existsSync(f) && f !== "CHANGELOG.md" && f !== "tests/name.test.ts");
    const old = /chromagent(?!ic)/i;
    // The marketplace "renames" map must name the old plugin so existing installs migrate.
    const text = (f: string) => readFileSync(f, "utf8").replace(/"renames":\s*\{[^}]*\}/, "");
    const leftovers = files.filter((f) => old.test(f) || old.test(text(f)));
    expect(leftovers).toEqual([]);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { regrade, type ReplayCase } from "../evals/lib/replay";

const evals = join(__dirname, "..", "evals");
const dir = join(evals, "replay", "hand-written");

describe("saved runs, graded again", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    it(file, () => {
      const replay = JSON.parse(readFileSync(join(dir, file), "utf8")) as ReplayCase;
      const metrics = regrade(replay, evals);
      for (const [name, [min, max]] of Object.entries(replay.expect ?? {})) {
        const value = metrics[name];
        expect(value, `${name} should be graded`).toBeTypeOf("number");
        expect(value as number, name).toBeGreaterThanOrEqual(min - 1e-9);
        expect(value as number, name).toBeLessThanOrEqual(max + 1e-9);
      }
    });
  }

  it("refuses an unknown scenario", () => {
    expect(() => regrade({ scenario: "nope", condition: "skill", changed: {}, transcript: { commands: [], toolArgs: [], finalMessage: "" } }, evals)).toThrow(/nope/);
  });
});

#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { run } from "./run";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };

run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  version: pkg.version,
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`Something went wrong: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  },
);
